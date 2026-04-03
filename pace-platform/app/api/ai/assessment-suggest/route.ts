/**
 * PACE Platform — AI Assessment Suggestion API
 *
 * POST /api/ai/assessment-suggest
 *
 * Tab 4 (総合評価) 用 AI サジェスション。
 * 負荷・効率・疼痛の 3 軸データを解析し、リスクカテゴリ・介入案・
 * フォローアップ計画を構造化して返す。
 *
 * プランゲート: feature_ai_soap (Pro 以上)
 * 現在はテンプレートベース。将来 Gemini に差し替え予定。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canAccess } from '@/lib/billing/plan-gates';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface LoadAnalysis {
  acwr: number;
  monotony: number;
  strain: number;
  acuteLoadChangePercent: number;
}

interface EfficiencyAnalysis {
  decoupling: number;
  overallEfficiencyScore: number;
  zScoreAlertCount: number;
}

interface PainAnalysis {
  nrsLoadCorrelation: number;
  patterns: string[];
  compensationAlert: string | null;
}

interface AssessmentSuggestRequestBody {
  athleteId: string;
  loadAnalysis: LoadAnalysis;
  efficiencyAnalysis: EfficiencyAnalysis;
  painAnalysis: PainAnalysis;
  pipelineDecision?: string;
  pipelinePriority?: string;
}

type RiskCategory =
  | 'overreaching'
  | 'accumulated_fatigue'
  | 'pain_management'
  | 'observation';

type InterventionPriority = 'high' | 'medium' | 'low';

interface Intervention {
  action: string;
  priority: InterventionPriority;
  evidence: string;
}

interface AssessmentSuggestion {
  suggestedCategory: RiskCategory;
  confidence: number;
  rationale: string;
  suggestedNotes: string;
  interventions: Intervention[];
  followUp: {
    nextAssessmentDays: number;
    checkpoints: string[];
  };
}

interface SuccessResponse {
  success: true;
  data: AssessmentSuggestion;
}

interface ErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

function isValidNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}

function validateRequestBody(
  body: unknown
): body is AssessmentSuggestRequestBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;

  if (typeof b.athleteId !== 'string' || b.athleteId.length === 0) return false;

  // loadAnalysis
  const la = b.loadAnalysis as Record<string, unknown> | undefined;
  if (!la || typeof la !== 'object') return false;
  if (
    !isValidNumber(la.acwr) ||
    !isValidNumber(la.monotony) ||
    !isValidNumber(la.strain) ||
    !isValidNumber(la.acuteLoadChangePercent)
  )
    return false;

  // efficiencyAnalysis
  const ea = b.efficiencyAnalysis as Record<string, unknown> | undefined;
  if (!ea || typeof ea !== 'object') return false;
  if (
    !isValidNumber(ea.decoupling) ||
    !isValidNumber(ea.overallEfficiencyScore) ||
    !isValidNumber(ea.zScoreAlertCount)
  )
    return false;

  // painAnalysis
  const pa = b.painAnalysis as Record<string, unknown> | undefined;
  if (!pa || typeof pa !== 'object') return false;
  if (!isValidNumber(pa.nrsLoadCorrelation)) return false;
  if (!Array.isArray(pa.patterns)) return false;
  if (
    pa.compensationAlert !== null &&
    typeof pa.compensationAlert !== 'string'
  )
    return false;

  // optional fields
  if (
    b.pipelineDecision !== undefined &&
    typeof b.pipelineDecision !== 'string'
  )
    return false;
  if (
    b.pipelinePriority !== undefined &&
    typeof b.pipelinePriority !== 'string'
  )
    return false;

  return true;
}

// ---------------------------------------------------------------------------
// テンプレートベース生成ロジック（将来 Gemini に差し替え）
// ---------------------------------------------------------------------------

function calculateDataCompleteness(
  body: AssessmentSuggestRequestBody
): number {
  let filled = 0;
  const total = 10;

  const { loadAnalysis: la, efficiencyAnalysis: ea, painAnalysis: pa } = body;

  if (isValidNumber(la.acwr)) filled++;
  if (isValidNumber(la.monotony)) filled++;
  if (isValidNumber(la.strain)) filled++;
  if (isValidNumber(la.acuteLoadChangePercent)) filled++;
  if (isValidNumber(ea.decoupling)) filled++;
  if (isValidNumber(ea.overallEfficiencyScore)) filled++;
  if (isValidNumber(ea.zScoreAlertCount)) filled++;
  if (isValidNumber(pa.nrsLoadCorrelation)) filled++;
  if (pa.patterns.length > 0) filled++;
  if (pa.compensationAlert !== null) filled++;

  return filled / total;
}

function generateSuggestion(
  body: AssessmentSuggestRequestBody
): AssessmentSuggestion {
  const { loadAnalysis: la, efficiencyAnalysis: ea, painAnalysis: pa } = body;

  const dataCompleteness = calculateDataCompleteness(body);

  // ----- カテゴリ判定 -----
  const isOverreaching = la.acwr > 1.5 && la.monotony > 2.0;
  const isAccumulatedFatigue = ea.decoupling > 5 && ea.overallEfficiencyScore < 50;
  const isPainManagement = pa.nrsLoadCorrelation > 0.7 && pa.patterns.length > 0;

  let category: RiskCategory;
  let confidence: number;
  let rationale: string;
  let suggestedNotes: string;
  const interventions: Intervention[] = [];
  let nextAssessmentDays: number;
  const checkpoints: string[] = [];

  // ----- Overreaching -----
  if (isOverreaching) {
    category = 'overreaching';
    confidence = Math.min(0.95, 0.7 + dataCompleteness * 0.25);

    rationale =
      `ACWR ${la.acwr.toFixed(2)} (>1.5) および Monotony ${la.monotony.toFixed(2)} (>2.0) が` +
      `オーバーリーチングの危険域を示しています。` +
      `急性負荷変動率 ${la.acuteLoadChangePercent.toFixed(1)}%、Strain ${la.strain.toFixed(0)} も考慮すると、` +
      `計画的な負荷軽減が必要と判断されます。`;

    suggestedNotes =
      `3軸分析の結果、オーバーリーチング傾向が検出されました。` +
      `ACWR・Monotony ともに閾値を超過しており、即時の負荷調整を推奨します。` +
      (ea.overallEfficiencyScore < 50
        ? ` 運動効率スコア (${ea.overallEfficiencyScore}) も低下しており、蓄積疲労の併存が疑われます。`
        : '') +
      (pa.compensationAlert
        ? ` 代償動作アラート: ${pa.compensationAlert}`
        : '');

    interventions.push(
      {
        action: '練習負荷を現在の 50-60% に軽減（最低 3 日間）',
        priority: 'high',
        evidence: `ACWR ${la.acwr.toFixed(2)} がオーバーリーチング閾値 1.5 を超過`,
      },
      {
        action: 'リカバリーセッション（軽度有酸素 + ストレッチ）を日次で実施',
        priority: 'high',
        evidence: `Monotony ${la.monotony.toFixed(2)} が単調性閾値 2.0 を超過`,
      },
      {
        action: '睡眠・栄養状態の確認と改善指導',
        priority: 'medium',
        evidence: '過負荷状態でのリカバリー促進に必要',
      }
    );

    if (la.strain > 3000) {
      interventions.push({
        action: 'Strain が極めて高い — 完全休養日の設定を検討',
        priority: 'high',
        evidence: `Strain ${la.strain.toFixed(0)} が高負荷域`,
      });
    }

    nextAssessmentDays = 2;
    checkpoints.push(
      'ACWR が 1.3 未満に回復しているか確認',
      'Monotony が 2.0 未満に低下しているか確認',
      '主観的コンディションスコアの改善傾向を確認'
    );

  // ----- Accumulated Fatigue -----
  } else if (isAccumulatedFatigue) {
    category = 'accumulated_fatigue';
    confidence = Math.min(0.90, 0.65 + dataCompleteness * 0.25);

    rationale =
      `Decoupling ${ea.decoupling.toFixed(1)}% (>5%) および運動効率スコア ${ea.overallEfficiencyScore} (<50) が` +
      `蓄積疲労を示唆しています。` +
      (ea.zScoreAlertCount > 0
        ? ` Z スコアアラート ${ea.zScoreAlertCount} 件も検出されています。`
        : '');

    suggestedNotes =
      `運動効率分析から蓄積疲労が示唆されます。` +
      `Decoupling が基準値を超えており、心拍-パフォーマンス比の乖離が進行しています。` +
      `計画的な回復期間の導入を推奨します。` +
      (la.acwr > 1.3
        ? ` ACWR (${la.acwr.toFixed(2)}) もやや高めであり、負荷管理の見直しも併せて検討してください。`
        : '');

    interventions.push(
      {
        action: '練習強度を 70% に制限し、ボリュームを 20% 削減',
        priority: 'high',
        evidence: `運動効率スコア ${ea.overallEfficiencyScore} が疲労蓄積域`,
      },
      {
        action: 'アクティブリカバリー日を週 2 回確保',
        priority: 'medium',
        evidence: `Decoupling ${ea.decoupling.toFixed(1)}% が閾値超過`,
      },
      {
        action: '水分補給・電解質管理の強化',
        priority: 'low',
        evidence: '効率低下時の基本対策',
      }
    );

    if (ea.zScoreAlertCount >= 3) {
      interventions.push({
        action: '複数の Z スコアアラート — 全体的なコンディション再評価を実施',
        priority: 'high',
        evidence: `Z スコアアラート ${ea.zScoreAlertCount} 件検出`,
      });
    }

    nextAssessmentDays = 3;
    checkpoints.push(
      'Decoupling が 5% 未満に回復しているか確認',
      '運動効率スコアの上昇傾向を確認',
      '主観的疲労度の変化を確認'
    );

  // ----- Pain Management -----
  } else if (isPainManagement) {
    category = 'pain_management';
    confidence = Math.min(0.85, 0.60 + dataCompleteness * 0.25);

    const patternText = pa.patterns.join('、');

    rationale =
      `NRS-負荷相関 ${pa.nrsLoadCorrelation.toFixed(2)} (>0.7) が高く、` +
      `疼痛パターン（${patternText}）が検出されました。` +
      `負荷増加に伴う疼痛増悪のリスクが高いと判断されます。` +
      (pa.compensationAlert
        ? ` 代償動作（${pa.compensationAlert}）にも注意が必要です。`
        : '');

    suggestedNotes =
      `疼痛分析から負荷関連の疼痛パターンが確認されました。` +
      `検出パターン: ${patternText}。` +
      `疼痛管理を優先しつつ、段階的な負荷復帰プログラムの検討を推奨します。` +
      (pa.compensationAlert
        ? ` 代償動作アラート: ${pa.compensationAlert}。動作修正プログラムの併用を推奨します。`
        : '');

    interventions.push(
      {
        action: '疼痛誘発動作の特定と回避・代替運動の指導',
        priority: 'high',
        evidence: `NRS-負荷相関 ${pa.nrsLoadCorrelation.toFixed(2)} が高相関域`,
      },
      {
        action: '疼痛日誌の記録を強化（活動・強度・NRS の関連）',
        priority: 'medium',
        evidence: `パターン検出: ${patternText}`,
      }
    );

    if (pa.compensationAlert) {
      interventions.push({
        action: `代償動作（${pa.compensationAlert}）に対する運動療法プログラムの導入`,
        priority: 'high',
        evidence: '代償動作は二次的傷害リスクを増大させる',
      });
    }

    interventions.push({
      action: '段階的負荷復帰プロトコルの策定（痛み閾値を基準）',
      priority: 'medium',
      evidence: '負荷-疼痛相関が高い場合の標準プロトコル',
    });

    nextAssessmentDays = 3;
    checkpoints.push(
      'NRS の推移と負荷量の関係を再評価',
      '代償動作の改善状況を確認',
      '疼痛パターンの変化を確認'
    );

  // ----- Observation (デフォルト) -----
  } else {
    category = 'observation';
    confidence = Math.min(0.80, 0.50 + dataCompleteness * 0.30);

    rationale =
      `3軸分析の結果、明確なリスク閾値の超過は検出されませんでした。` +
      `ACWR ${la.acwr.toFixed(2)}、Monotony ${la.monotony.toFixed(2)}、` +
      `Decoupling ${ea.decoupling.toFixed(1)}%、NRS相関 ${pa.nrsLoadCorrelation.toFixed(2)} — ` +
      `いずれも基準値内です。現状の経過観察を推奨します。`;

    suggestedNotes =
      `3軸総合評価の結果、現時点で介入が必要なリスク因子は検出されませんでした。` +
      `通常のトレーニング計画を継続し、定期的なモニタリングを実施してください。` +
      (la.acwr > 1.3
        ? ` ただし ACWR (${la.acwr.toFixed(2)}) がやや上昇傾向にあるため、負荷推移の注視を推奨します。`
        : '') +
      (ea.zScoreAlertCount > 0
        ? ` Z スコアアラート ${ea.zScoreAlertCount} 件を念頭に、効率指標も確認してください。`
        : '');

    interventions.push(
      {
        action: '現行トレーニング計画の継続',
        priority: 'low',
        evidence: '全指標が基準値内',
      },
      {
        action: '定期モニタリングの継続（日次チェックイン + 週次レビュー）',
        priority: 'low',
        evidence: '予防的観察の標準プロトコル',
      }
    );

    if (la.acwr > 1.2) {
      interventions.push({
        action: 'ACWR 上昇傾向に注意 — 今後の負荷増加計画を慎重に管理',
        priority: 'medium',
        evidence: `ACWR ${la.acwr.toFixed(2)} がやや上昇傾向`,
      });
    }

    nextAssessmentDays = 7;
    checkpoints.push(
      '次回定期評価で 3 軸指標を再確認',
      '選手の主観的コンディションに変化がないか確認'
    );
  }

  // ----- Pipeline decision/priority の反映 -----
  if (body.pipelineDecision) {
    suggestedNotes += ` パイプライン判定: ${body.pipelineDecision}。`;
  }
  if (body.pipelinePriority) {
    suggestedNotes += ` 優先度: ${body.pipelinePriority}。`;
  }

  return {
    suggestedCategory: category,
    confidence: Math.round(confidence * 100) / 100,
    rationale,
    suggestedNotes,
    interventions,
    followUp: {
      nextAssessmentDays,
      checkpoints,
    },
  };
}

// ---------------------------------------------------------------------------
// POST /api/ai/assessment-suggest
// ---------------------------------------------------------------------------

export async function POST(
  request: Request
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    // ----- 認証チェック -----
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    // ----- スタッフ情報取得 -----
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, org_id, role')
      .eq('id', user.id)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { success: false, error: 'スタッフ情報が見つかりません。' },
        { status: 403 }
      );
    }

    // ----- プランゲート: feature_ai_soap (Pro 以上) -----
    const accessResult = await canAccess(
      supabase,
      staff.org_id as string,
      'feature_ai_soap'
    );

    if (!accessResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: accessResult.reason ?? 'この機能にはProプラン以上が必要です。',
        },
        { status: 403 }
      );
    }

    // ----- リクエストボディのパースとバリデーション -----
    let body: unknown;
    try {
      body = (await request.json()) as unknown;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'リクエストボディのJSONパースに失敗しました。',
        },
        { status: 400 }
      );
    }

    if (!validateRequestBody(body)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'リクエストボディが不正です。athleteId, loadAnalysis, efficiencyAnalysis, painAnalysis が必要です。',
        },
        { status: 400 }
      );
    }

    // ----- アスリート存在確認（org_id でアクセス権も検証）-----
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('id')
      .eq('id', body.athleteId)
      .eq('org_id', staff.org_id as string)
      .single();

    if (athleteError || !athlete) {
      return NextResponse.json(
        {
          success: false,
          error:
            '指定されたアスリートが見つからないか、アクセス権がありません。',
        },
        { status: 404 }
      );
    }

    // ----- サジェスション生成（テンプレートベース）-----
    const suggestion = generateSuggestion(body);

    // ----- レスポンス -----
    return NextResponse.json({
      success: true,
      data: suggestion,
    });
  } catch (err) {
    console.error('[ai:assessment-suggest] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 }
    );
  }
}
