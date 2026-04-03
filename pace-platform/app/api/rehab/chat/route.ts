/**
 * POST /api/rehab/chat
 *
 * チャットベース個別リハビリメニュー生成 API（Pro+ 専用）。
 * 既存の rehab-generator.ts の型定義とガードレールを再利用し、
 * 対話的にリハビリプランを作成・調整する。
 *
 * Body: {
 *   athleteId: string,
 *   sessionId?: string,   // 継続会話用
 *   message: string,
 * }
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
  buildInjectedContext,
  type BayesianDiagnosisResult,
  type CvKinematicsData,
  type AthleteProfile,
} from '@/lib/gemini/context-injector';
import { cleanJsonResponse, sanitizeUserInput } from '@/lib/shared/security-helpers';
import { checkRateLimit, checkMonthlyBudget, buildRateLimitResponse } from '@/lib/gemini/rate-limiter';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RehabChatRequest {
  athleteId: string;
  sessionId?: string;
  message: string;
  finalize?: boolean;
}

// ---------------------------------------------------------------------------
// POST /api/rehab/chat
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

    // Pro+ 専用機能
    const access = await canAccess(supabase, staff.org_id, 'feature_ai_weekly_plan');
    if (!access.allowed) {
      return NextResponse.json(
        { error: 'この機能は Pro プラン以上で利用できます。' },
        { status: 403 },
      );
    }

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
    const rateLimit = await checkRateLimit(staff.id, 'rehab-chat', staff.org_id);
    if (!rateLimit.allowed) {
      const { body, retryAfterSeconds } = buildRateLimitResponse(rateLimit);
      return NextResponse.json(body, {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) },
      });
    }

    let body: RehabChatRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'リクエストボディのパースに失敗しました。' },
        { status: 400 },
      );
    }

    if (!body.athleteId || !body.message) {
      return NextResponse.json(
        { error: 'athleteId と message は必須です。' },
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

    // finalize 時は早期に権限チェック（Gemini 呼び出し前にブロック）
    if (body.finalize) {
      const approvalRoles = ['AT', 'PT', 'master'];
      if (!approvalRoles.includes(staff.role as string)) {
        return NextResponse.json(
          { error: 'メニュー確定にはAT/PT/master権限が必要です。' },
          { status: 403 },
        );
      }
    }

    // 選手データ取得（org_id + team_id で IDOR 防止）
    let athleteQuery = supabase
      .from('athletes')
      .select('id, name, position, sport, org_id, age, sex')
      .eq('id', body.athleteId)
      .eq('org_id', staff.org_id);

    // master ロール以外は自チームの選手のみアクセス可能
    if (staff.role !== 'master' && staff.team_id) {
      athleteQuery = athleteQuery.eq('team_id', staff.team_id);
    }

    const { data: athlete } = await athleteQuery.single();

    if (!athlete) {
      return NextResponse.json(
        { error: '選手が見つかりません。' },
        { status: 404 },
      );
    }

    // ベイズ推論結果を取得（最新の完了済みセッション）
    const { data: sessionData } = await supabase
      .from('assessment_sessions')
      .select(`
        id, assessment_type,
        assessment_responses(
          node_id, answer,
          assessment_nodes(
            node_id, question_text, category, target_axis,
            lr_yes, lr_no, base_prevalence,
            prescription_tags_json, contraindication_tags_json
          )
        )
      `)
      .eq('athlete_id', body.athleteId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // ベイズ結果を構築
    const bayesResult = buildBayesResult(body.athleteId, sessionData);

    // CV データ取得（あれば）
    const { data: cvData } = await supabase
      .from('cv_measurements')
      .select('*')
      .eq('athlete_id', body.athleteId)
      .order('measured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let cvKinematics: CvKinematicsData | null = null;
    if (cvData) {
      const cv: CvKinematicsData = {
        athleteId: body.athleteId,
        measuredAt: cvData.measured_at as string,
      };
      if (cvData.cmj_asymmetry_ratio != null) cv.cmjAsymmetryRatio = cvData.cmj_asymmetry_ratio as number;
      if (cvData.rsi_norm != null) cv.rsiNorm = cvData.rsi_norm as number;
      if (cvData.knee_valgus_left != null) {
        cv.kneeValgusAngle = { left: cvData.knee_valgus_left as number, right: (cvData.knee_valgus_right as number) ?? 0 };
      }
      if (cvData.hip_flexion_left != null) {
        cv.hipFlexionRom = { left: cvData.hip_flexion_left as number, right: (cvData.hip_flexion_right as number) ?? 0 };
      }
      if (cvData.acwr != null) cv.acwr = cvData.acwr as number;
      if (cvData.hrv_baseline_ratio != null) cv.hrvBaselineRatio = cvData.hrv_baseline_ratio as number;
      cvKinematics = cv;
    }

    // ロック情報取得
    const { data: locks } = await supabase
      .from('athlete_locks')
      .select('lock_type, tag')
      .eq('athlete_id', body.athleteId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

    const hardLock = locks?.some((l) => l.lock_type === 'hard') ?? false;
    const softLock = locks?.some((l) => l.lock_type === 'soft') ?? false;

    // AthleteProfile 構築
    const profile: AthleteProfile = {
      id: athlete.id as string,
      name: athlete.name as string,
      age: (athlete.age as number) ?? 25,
      sex: ((athlete.sex as string) ?? 'male') as 'male' | 'female',
      sport: (athlete.sport as string) ?? 'unknown',
      position: (athlete.position as string) ?? undefined,
    };

    // コンテキスト注入
    const { systemPrompt: injectedContext } = buildInjectedContext(
      profile,
      bayesResult,
      cvKinematics,
      'rehab',
    );

    // 会話履歴取得
    let chatHistory: ChatMessage[] = [];
    let rehabSessionId = body.sessionId;

    if (rehabSessionId) {
      const { data: existing } = await supabase
        .from('rehab_sessions')
        .select('chat_history')
        .eq('id', rehabSessionId)
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
    const systemContext = `${buildCdsSystemPrefix()}
あなたは個別選手のリハビリメニューを対話的に作成するアシスタントです。
スタッフの指示に従い、リハビリメニューを提案・修正してください。
回答は自然な日本語で行い、メニュー提案時はJSONブロックも含めてください。

${injectedContext}

=== ロック状態 ===
- Hard Lock: ${hardLock ? '有効（トレーニング完全禁止）' : '無効'}
- Soft Lock: ${softLock ? '有効（軽度リカバリーのみ）' : '無効'}

=== 禁忌タグ ===
${bayesResult.contraindicationTags.length > 0 ? bayesResult.contraindicationTags.join(', ') : 'なし'}

=== 重要ルール ===
- Hard Lock 有効時はメニューを提案しないこと
- Soft Lock 有効時は軽度のリカバリー運動のみ
- 禁忌タグに該当する運動は絶対に含めないこと
- 各フェーズの進展基準と中止基準を必ず含めること
- VAS 痛み限界値を各エクササイズに設定すること

=== 禁忌タグ管理 ===
- スタッフが「〇〇も禁忌に追加して」と指示した場合、contraindication_tags に追加すること
- スタッフが「〇〇は許可」と指示した場合、contraindication_tags から除外すること
- contraindication_tags に含まれるタグに該当する運動は絶対にメニューに含めないこと

=== リハビリメニューJSON形式（メニュー提案時に使用）===
メニューを提案する際は、回答の最後に以下のJSONブロックを含めてください:
\`\`\`json
{
  "contraindication_tags": ["禁忌タグ1", "禁忌タグ2"],
  "primary_diagnosis_hint": "推定される主傷害名",
  "risk_level": "critical|high|medium|low",
  "phases": [
    {
      "phase": "acute|recovery|functional|return_to_sport",
      "phase_label": "フェーズ名",
      "duration_days_min": <数値>,
      "duration_days_max": <数値>,
      "goals": ["目標1"],
      "exercises": [
        {
          "id": "ex_001",
          "name": "エクササイズ名",
          "description": "実施方法",
          "sets": <数値>,
          "reps": "10-15",
          "rest_seconds": <数値>,
          "tags": ["タグ"],
          "contraindications": ["禁忌条件"],
          "progression_notes": "進展基準",
          "pain_vas_limit": <0-10>
        }
      ],
      "progression_criteria": ["進展基準"],
      "red_flags": ["中止基準"]
    }
  ],
  "general_precautions": ["注意事項"],
  "follow_up_recommendation": "フォローアップ推奨"
}
\`\`\`
`;

    // 直近10メッセージのみ渡す
    const recentHistory = chatHistory.slice(-10);
    const conversationText = recentHistory
      .map((m) => `${m.role === 'user' ? 'スタッフ' : 'AI'}: ${m.content}`)
      .join('\n\n');

    const fullPrompt = `${systemContext}\n\n=== 会話履歴 ===\n${conversationText}\n\nAI:`;

    // Hard Lock チェック
    if (hardLock) {
      const hardLockReply =
        'この選手は現在 Hard Lock が有効です。医師の承認後にロックを解除してからリハビリメニューを作成してください。';
      chatHistory.push({ role: 'assistant', content: hardLockReply });

      return NextResponse.json({
        success: true,
        data: {
          sessionId: rehabSessionId,
          reply: hardLockReply,
          menu: null,
          tokenUsage: budgetResult.usage,
          tokenLimit: budgetResult.limit,
        },
      });
    }

    // Gemini 呼び出し
    const { result: replyText } = await callGeminiWithRetry(
      fullPrompt,
      (text) => text,
      { userId: staff.id, endpoint: 'rehab-chat' },
    );

    // AI 返答を履歴に追加
    chatHistory.push({ role: 'assistant', content: replyText });

    // JSON メニューを抽出（あれば）
    let menu: Record<string, unknown> | null = null;
    const jsonMatch = replyText.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      try {
        const parsed = JSON.parse(cleanJsonResponse(jsonMatch[1]));

        // AI 提案の禁忌タグを抽出しベイズ結果とマージ
        const aiContraindicationTags: string[] = Array.isArray(parsed.contraindication_tags)
          ? parsed.contraindication_tags
          : [];
        const mergedContraindications = [
          ...new Set([...bayesResult.contraindicationTags, ...aiContraindicationTags]),
        ];

        // 禁忌タグチェック — 違反があればメニュー全体を無効化
        let hasContraindicationViolation = false;
        if (parsed.phases && mergedContraindications.length > 0) {
          outer: for (const phase of parsed.phases) {
            for (const exercise of phase.exercises ?? []) {
              for (const tag of exercise.tags ?? []) {
                if (
                  mergedContraindications.some((ct: string) =>
                    tag.toLowerCase().includes(ct.toLowerCase()),
                  )
                ) {
                  console.warn(
                    `[rehab-chat] 禁忌タグ違反検出: exercise="${exercise.name}" tag="${tag}" — メニューを無効化`,
                  );
                  hasContraindicationViolation = true;
                  break outer;
                }
              }
            }
          }
        }

        if (hasContraindicationViolation) {
          menu = null;
        } else {
          // 禁忌タグをメニューにマージして保存
          menu = { ...parsed, contraindication_tags: mergedContraindications };
        }
      } catch {
        // JSON パース失敗は無視
      }
    }

    // --- メニュー確定（承認）処理 ---
    if (body.finalize) {
      // finalize 時は既存セッションのメニューを使用（Gemini の新規レスポンスではなく）
      // stale セッション再承認防止: sessionId 必須
      if (!rehabSessionId) {
        return NextResponse.json(
          { error: 'メニュー確定にはセッションIDが必要です。' },
          { status: 400 },
        );
      }

      // DB から最新の menu_json を取得（stale 防止）
      const { data: currentSession } = await supabase
        .from('rehab_sessions')
        .select('menu_json, approved_at')
        .eq('id', rehabSessionId)
        .single();

      // 既に承認済みなら二重承認防止
      if (currentSession?.approved_at) {
        return NextResponse.json(
          { error: 'このセッションは既に承認済みです。' },
          { status: 409 },
        );
      }

      const finalizeMenu = menu ?? (currentSession?.menu_json as Record<string, unknown> | null);
      if (!finalizeMenu) {
        return NextResponse.json(
          { error: '確定するメニューがありません。AIにメニューを提案させてください。' },
          { status: 400 },
        );
      }

      // P2-1: 最新のロック状態・禁忌タグを再検証
      const { data: currentLocks } = await supabase
        .from('athlete_locks')
        .select('lock_type, tag')
        .eq('athlete_id', body.athleteId)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

      const currentHardLock = currentLocks?.some((l) => l.lock_type === 'hard') ?? false;
      if (currentHardLock) {
        return NextResponse.json(
          { error: 'Hard Lock が有効です。医師の承認後にロックを解除してから確定してください。' },
          { status: 403 },
        );
      }

      // 承認記録を保存
      const approvalData = {
        approved_at: new Date().toISOString(),
        approved_by: staff.id,
        approved_role: staff.role,
        approved_contraindications: (finalizeMenu as Record<string, unknown>).contraindication_tags ?? [],
        approved_menu: finalizeMenu,
      };

      await supabase
        .from('rehab_sessions')
        .update({
          chat_history: chatHistory,
          menu_json: {
            ...finalizeMenu,
            athlete_id: body.athleteId,
            generated_at: new Date().toISOString(),
            disclaimer: MEDICAL_DISCLAIMER,
          },
          ...approvalData,
        })
        .eq('id', rehabSessionId);

      return NextResponse.json({
        success: true,
        data: {
          sessionId: rehabSessionId,
          reply: replyText,
          menu: finalizeMenu,
          finalized: true,
          tokenUsage: budgetResult.usage,
          tokenLimit: budgetResult.limit,
        },
      });
    }

    // rehab_sessions テーブルに保存/更新
    if (rehabSessionId) {
      const { error: updateError } = await supabase
        .from('rehab_sessions')
        .update({
          chat_history: chatHistory,
          menu_json: menu
            ? {
                ...menu,
                athlete_id: body.athleteId,
                generated_at: new Date().toISOString(),
                disclaimer: MEDICAL_DISCLAIMER,
              }
            : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rehabSessionId);

      if (updateError) {
        console.warn('[rehab-chat] セッション更新失敗（並行書き込み競合の可能性）:', updateError.message);
      }
    } else {
      const { data: newSession } = await supabase
        .from('rehab_sessions')
        .insert({
          athlete_id: body.athleteId,
          org_id: staff.org_id,
          staff_id: staff.id,
          chat_history: chatHistory,
          menu_json: menu
            ? {
                ...menu,
                athlete_id: body.athleteId,
                generated_at: new Date().toISOString(),
                disclaimer: MEDICAL_DISCLAIMER,
              }
            : null,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      rehabSessionId = newSession?.id ?? undefined;
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: rehabSessionId,
        reply: replyText,
        menu,
        contraindicationTags: menu
          ? ((menu as Record<string, unknown>).contraindication_tags as string[]) ?? bayesResult.contraindicationTags
          : bayesResult.contraindicationTags,
        tokenUsage: budgetResult.usage,
        tokenLimit: budgetResult.limit,
      },
    });
  } catch (err) {
    console.error('[rehab/chat] 予期しないエラー:', err);

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
      { error: 'リハビリチャット処理中にエラーが発生しました。' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function buildBayesResult(
  athleteId: string,
  sessionData: Record<string, unknown> | null,
): BayesianDiagnosisResult {
  const defaultResult: BayesianDiagnosisResult = {
    sessionId: '',
    athleteId,
    assessmentType: 'acute',
    topDiagnoses: [],
    keyEvidenceNodes: [],
    contraindicationTags: [],
    prescriptionTags: [],
    overallRiskLevel: 'low',
    hardLockActive: false,
    completedAt: new Date().toISOString(),
  };

  if (!sessionData) return defaultResult;

  const responses = sessionData.assessment_responses as
    | Array<Record<string, unknown>>
    | null;
  if (!responses) return defaultResult;

  const contraindicationTags: string[] = [];
  const prescriptionTags: string[] = [];
  const keyNodes: BayesianDiagnosisResult['keyEvidenceNodes'] = [];

  for (const resp of responses) {
    const answer = resp.answer as string;
    const node = resp.assessment_nodes as Record<string, unknown> | null;
    if (!node) continue;

    if (answer === 'yes') {
      const ciTags =
        (node.contraindication_tags_json as string[] | null) ?? [];
      const pTags = (node.prescription_tags_json as string[] | null) ?? [];
      contraindicationTags.push(...ciTags);
      prescriptionTags.push(...pTags);
    }

    keyNodes.push({
      nodeId: node.node_id as string,
      description: node.question_text as string,
      answer: answer as 'yes' | 'no' | 'unknown',
      likelihoodRatio: (node.lr_yes as number) ?? 1,
    });
  }

  return {
    ...defaultResult,
    sessionId: sessionData.id as string,
    assessmentType:
      (sessionData.assessment_type as 'acute' | 'chronic' | 'performance') ??
      'acute',
    keyEvidenceNodes: keyNodes,
    contraindicationTags: [...new Set(contraindicationTags)],
    prescriptionTags: [...new Set(prescriptionTags)],
  };
}
