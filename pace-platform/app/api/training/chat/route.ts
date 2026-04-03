/**
 * POST /api/training/chat
 *
 * チャットベース AI トレーニングメニュー生成 API。
 * トレーナーと対話しながらメニューを段階的に作成する。
 *
 * Body: {
 *   teamId: string,
 *   weekStartDate: string,
 *   trainingPeriod: string,
 *   sessionId?: string,   // 継続会話用 (workout ID)
 *   message: string,      // ユーザーメッセージ
 * }
 *
 * Standard: チーム全体メニューのみ
 * Pro+: 個別選手調整も生成
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canAccess } from '@/lib/billing/plan-gates';
import {
  callGeminiWithRetry,
  buildCdsSystemPrefix,
  MEDICAL_DISCLAIMER,
} from '@/lib/gemini/client';
import {
  buildTeamConditionSummary,
  type AthleteConditionSummary,
} from '@/lib/gemini/team-menu-generator';
import { cleanJsonResponse, sanitizeUserInput } from '@/lib/shared/security-helpers';
import { checkRateLimit, checkMonthlyBudget, buildRateLimitResponse } from '@/lib/gemini/rate-limiter';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  teamId: string;
  weekStartDate: string;
  trainingPeriod: 'pre_season' | 'in_season' | 'post_season' | 'off_season';
  sessionId?: string;
  message: string;
  finalize?: boolean; // true の場合メニューを確定して draft 保存
}

// ---------------------------------------------------------------------------
// POST /api/training/chat
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
    }

    const { data: staff } = await supabase
      .from('staff')
      .select('id, org_id, role, team_id')
      .eq('id', user.id)
      .single();

    if (!staff) {
      return NextResponse.json(
        { error: 'スタッフプロファイルが見つかりません。' },
        { status: 403 },
      );
    }

    // プランチェック（Standard でもチーム全体メニューは利用可能）
    const access = await canAccess(supabase, staff.org_id, 'feature_ai_weekly_plan');
    const isPro = access.allowed;

    // トークン予算チェック
    const budgetResult = await checkMonthlyBudget(staff.org_id);
    if (!budgetResult.allowed) {
      return NextResponse.json({
        error: 'TOKEN_BUDGET_EXCEEDED',
        message: '今月の AI 利用上限に達しました。',
        usage: budgetResult.usage,
        limit: budgetResult.limit,
        ctaOptions: [
          { label: '追加トークンを購入', href: '/admin/billing?action=addon' },
          { label: 'プランをアップグレード', href: '/admin/billing?action=upgrade' },
        ],
      }, { status: 429 });
    }

    // 毎分レートリミットチェック
    const rateLimit = await checkRateLimit(staff.id, 'training-chat', staff.org_id);
    if (!rateLimit.allowed) {
      const { body: rlBody, retryAfterSeconds } = buildRateLimitResponse(rateLimit);
      return NextResponse.json(rlBody, {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) },
      });
    }

    let body: ChatRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'リクエストボディのパースに失敗しました。' },
        { status: 400 },
      );
    }

    if (!body.teamId || !body.message) {
      return NextResponse.json(
        { error: 'teamId と message は必須です。' },
        { status: 400 },
      );
    }

    // メッセージ長制限（5000文字）
    if (body.message.length > 5_000) {
      return NextResponse.json(
        { error: 'メッセージは5000文字以内で入力してください。' },
        { status: 400 },
      );
    }

    // サニタイズ
    body.message = sanitizeUserInput(body.message);

    // チーム情報取得（org_id + team_id で IDOR 防止）
    let teamQuery = supabase
      .from('teams')
      .select('id, name, org_id')
      .eq('id', body.teamId)
      .eq('org_id', staff.org_id);

    // master ロール以外は自チームのみアクセス可能
    if (staff.role !== 'master' && staff.team_id) {
      teamQuery = teamQuery.eq('id', staff.team_id);
    }

    const { data: team } = await teamQuery.single();

    if (!team) {
      return NextResponse.json(
        { error: 'チームが見つかりません。' },
        { status: 404 },
      );
    }

    // 選手データ取得
    const { data: athletes } = await supabase
      .from('athletes')
      .select('id, name, position, sport')
      .eq('team_id', body.teamId)
      .eq('org_id', staff.org_id);

    if (!athletes || athletes.length === 0) {
      return NextResponse.json(
        { error: 'チームに選手が登録されていません。' },
        { status: 400 },
      );
    }

    // ロック・コンディション情報を集約
    const athleteIds = athletes.map((a) => a.id);
    const [locksResult, scoresResult] = await Promise.all([
      supabase
        .from('athlete_locks')
        .select('athlete_id, lock_type, tag')
        .in('athlete_id', athleteIds)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
      supabase
        .from('conditioning_scores')
        .select('athlete_id, acwr, hrv_baseline_ratio, srpe, risk_level')
        .in('athlete_id', athleteIds)
        .order('recorded_at', { ascending: false }),
    ]);

    const athleteSummaries = buildAthleteSummaries(
      athletes,
      locksResult.data ?? [],
      scoresResult.data ?? [],
    );

    // 会話履歴の取得（既存セッション or 新規）
    let chatHistory: ChatMessage[] = [];
    let workoutId = body.sessionId;

    if (workoutId) {
      const { data: existing } = await supabase
        .from('workouts')
        .select('chat_history')
        .eq('id', workoutId)
        .single();
      if (existing?.chat_history) {
        chatHistory = (existing.chat_history as ChatMessage[]).filter(
          (m) => m.role === 'user' || m.role === 'assistant',
        );
      }
    }

    // ユーザーメッセージを追加
    chatHistory.push({ role: 'user', content: body.message });

    // プロンプト構築
    const teamCondition = buildTeamConditionSummary(athleteSummaries);
    const systemPrefix = buildCdsSystemPrefix();

    const planRestriction = isPro
      ? '個別選手調整（individual_adjustments）も含めてください。'
      : '個別選手調整は含めず、チーム全体のセッションのみ生成してください。';

    const systemContext = `${systemPrefix}
あなたはチームのトレーニングメニューを対話的に作成するアシスタントです。
トレーナーの指示に従い、メニューを提案・修正してください。
回答は自然な日本語で行い、メニュー提案時はJSONブロックも含めてください。

=== チーム情報 ===
- チーム名: ${team.name}
- スポーツ: ${athletes[0]?.sport ?? 'unknown'}
- トレーニング期間: ${body.trainingPeriod}
- 週開始日: ${body.weekStartDate}
- 選手数: ${athletes.length}名

=== チームコンディション概要 ===
${teamCondition}

=== プラン制約 ===
${planRestriction}

=== メニューJSON形式（メニュー提案時に使用）===
メニューを提案する際は、回答の最後に以下のJSONブロックを含めてください:
\`\`\`json
{
  "team_sessions": [...],
  "individual_adjustments": [...],
  "locked_athletes_notice": [...],
  "weekly_load_note": "..."
}
\`\`\`
`;

    // 直近10メッセージのみ渡す
    const recentHistory = chatHistory.slice(-10);
    const conversationText = recentHistory
      .map((m) => `${m.role === 'user' ? 'トレーナー' : 'AI'}: ${m.content}`)
      .join('\n\n');

    const fullPrompt = `${systemContext}\n\n=== 会話履歴 ===\n${conversationText}\n\nAI:`;

    // Gemini 呼び出し
    const { result: replyText } = await callGeminiWithRetry(
      fullPrompt,
      (text) => text, // テキストそのまま返す
      { userId: staff.id, endpoint: 'training-chat' },
    );

    // AI 返答を履歴に追加
    chatHistory.push({ role: 'assistant', content: replyText });

    // JSON メニューを抽出（あれば）
    let menu = null;
    const jsonMatch = replyText.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      try {
        menu = JSON.parse(cleanJsonResponse(jsonMatch[1]));
      } catch {
        // JSON パース失敗は無視（まだメニュー未完成の可能性）
      }
    }

    // workouts テーブルに保存/更新
    if (workoutId) {
      const { error: updateError } = await supabase
        .from('workouts')
        .update({
          chat_history: chatHistory,
          menu_json: menu
            ? {
                ...menu,
                team_id: body.teamId,
                week_start_date: body.weekStartDate,
                generated_at: new Date().toISOString(),
                training_period: body.trainingPeriod,
                disclaimer: MEDICAL_DISCLAIMER,
              }
            : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workoutId);

      if (updateError) {
        console.warn('[training-chat] ワークアウト更新失敗:', updateError.message);
      }
    } else {
      const { data: newWorkout } = await supabase
        .from('workouts')
        .insert({
          team_id: body.teamId,
          org_id: staff.org_id,
          generated_by_ai: true,
          chat_history: chatHistory,
          menu_json: menu
            ? {
                ...menu,
                team_id: body.teamId,
                week_start_date: body.weekStartDate,
                generated_at: new Date().toISOString(),
                training_period: body.trainingPeriod,
                disclaimer: MEDICAL_DISCLAIMER,
              }
            : null,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      workoutId = newWorkout?.id ?? undefined;
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: workoutId,
        reply: replyText,
        menu,
        tokenUsage: budgetResult.usage,
        tokenLimit: budgetResult.limit,
      },
    });
  } catch (err) {
    console.error('[training/chat] 予期しないエラー:', err);

    if (err instanceof Error) {
      if (err.message === 'GEMINI_EXHAUSTED') {
        return NextResponse.json(
          { error: 'AI サービスが一時的に利用できません。' },
          { status: 503 },
        );
      }
      if (err.message === 'RATE_LIMIT_EXCEEDED') {
        return NextResponse.json(
          { error: 'API 呼び出し上限に達しました。' },
          { status: 429 },
        );
      }
    }

    return NextResponse.json(
      { error: 'チャット処理中にエラーが発生しました。' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function buildAthleteSummaries(
  athletes: Array<{ id: string; name: string; position?: string; sport?: string }>,
  locks: Array<{ athlete_id: string; lock_type: string; tag: string }>,
  scores: Array<{
    athlete_id: string;
    acwr: number | null;
    hrv_baseline_ratio: number | null;
    srpe: number | null;
    risk_level: string | null;
  }>,
): AthleteConditionSummary[] {
  const lockMap: Record<string, { hard: boolean; soft: boolean; tags: string[] }> = {};
  for (const lock of locks) {
    if (!lockMap[lock.athlete_id]) {
      lockMap[lock.athlete_id] = { hard: false, soft: false, tags: [] };
    }
    const entry = lockMap[lock.athlete_id]!;
    if (lock.lock_type === 'hard') entry.hard = true;
    if (lock.lock_type === 'soft') entry.soft = true;
    entry.tags.push(lock.tag);
  }

  const condMap: Record<string, Record<string, number | string>> = {};
  const seen = new Set<string>();
  for (const s of scores) {
    if (seen.has(s.athlete_id)) continue;
    seen.add(s.athlete_id);
    const entry: Record<string, number | string> = {};
    if (s.acwr != null) entry.acwr = s.acwr;
    if (s.hrv_baseline_ratio != null) entry.hrv_baseline_ratio = s.hrv_baseline_ratio;
    if (s.srpe != null) entry.srpe = s.srpe;
    if (s.risk_level != null) entry.risk_level = s.risk_level;
    condMap[s.athlete_id] = entry;
  }

  return athletes.map((a) => {
    const lock = lockMap[a.id] ?? { hard: false, soft: false, tags: [] };
    const cond = condMap[a.id] ?? {};

    let riskLevel: AthleteConditionSummary['risk_level'] = 'none';
    if (cond.risk_level) riskLevel = cond.risk_level as AthleteConditionSummary['risk_level'];
    if (lock.hard) riskLevel = 'critical';
    else if (lock.soft && riskLevel === 'none') riskLevel = 'high';

    const summary: AthleteConditionSummary = {
      athlete_id: a.id,
      name: a.name,
      risk_level: riskLevel,
      hard_lock_active: lock.hard,
      soft_lock_active: lock.soft,
      restriction_tags: lock.tags,
    };

    if (a.position) summary.position = a.position;
    if (typeof cond.acwr === 'number') summary.acwr = cond.acwr;
    if (typeof cond.hrv_baseline_ratio === 'number') summary.hrv_baseline_ratio = cond.hrv_baseline_ratio;
    if (typeof cond.srpe === 'number') summary.srpe_last_session = cond.srpe;

    return summary;
  });
}
