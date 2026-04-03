/**
 * PACE Platform — AI SOAP Assistant API
 *
 * POST /api/ai/soap-assist
 *
 * SOAP ノートの各セクション（S/O/A/P）または全体に対して、
 * AI による構造化・提案・鑑別リスト生成を行う。
 *
 * Pro プラン以上が必要（feature_ai_soap）。
 *
 * 現在はテンプレートベースの生成（template-v1）を使用。
 * Gemini 2.0 Flash 統合時にスワップ可能な構造。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateUUID } from '@/lib/security/input-validator';
import { canAccess } from '@/lib/billing/plan-gates';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type SoapSection = 's' | 'o' | 'a' | 'p' | 'full';

interface SoapAssistRequestBody {
  athleteId: string;
  section: SoapSection;
  input: {
    sText?: string;
    oText?: string;
    aText?: string;
    pText?: string;
  };
  context?: {
    pipelineDecision?: string;
    pipelinePriority?: string;
    riskCategory?: string;
    acwr?: number;
    nrs?: number;
    diagnosis?: string;
  };
}

interface Differential {
  condition: string;
  likelihood: string;
}

interface SoapSuggestion {
  text: string;
  confidence: number;
  highlights: string[];
  additionalChecks?: string[];
  differentials?: Differential[];
  followUpDates?: string[];
}

interface SoapAssistSuccessResponse {
  success: true;
  data: {
    section: string;
    suggestion: SoapSuggestion;
    metadata: {
      model: 'template-v1';
      processingTime: number;
    };
  };
}

interface SoapAssistErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const VALID_SECTIONS: SoapSection[] = ['s', 'o', 'a', 'p', 'full'];

const VALID_DECISIONS = ['RED', 'ORANGE', 'YELLOW', 'GREEN'];
const VALID_PRIORITIES = ['P1', 'P2', 'P3', 'P4', 'P5'];
const VALID_RISK_CATEGORIES = [
  'overreaching',
  'accumulated_fatigue',
  'pain_management',
  'observation',
];

function validateRequestBody(
  body: unknown
): { valid: true; data: SoapAssistRequestBody } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'リクエストボディが不正です。' };
  }

  const b = body as Record<string, unknown>;

  // athleteId
  if (!b.athleteId || typeof b.athleteId !== 'string' || !validateUUID(b.athleteId)) {
    return { valid: false, error: 'athleteId は有効な UUID 形式である必要があります。' };
  }

  // section
  if (!b.section || !VALID_SECTIONS.includes(b.section as SoapSection)) {
    return {
      valid: false,
      error: `section は ${VALID_SECTIONS.join(', ')} のいずれかである必要があります。`,
    };
  }

  // input
  if (!b.input || typeof b.input !== 'object') {
    return { valid: false, error: 'input オブジェクトが必要です。' };
  }

  const input = b.input as Record<string, unknown>;
  const section = b.section as SoapSection;

  // セクション別の必須入力チェック
  if (section === 's' && (!input.sText || typeof input.sText !== 'string')) {
    return { valid: false, error: 'S セクションには sText が必要です。' };
  }
  if (section === 'o' && (!input.oText || typeof input.oText !== 'string')) {
    return { valid: false, error: 'O セクションには oText が必要です。' };
  }
  if (section === 'a') {
    if ((!input.sText || typeof input.sText !== 'string') && (!input.oText || typeof input.oText !== 'string')) {
      return { valid: false, error: 'A セクションには sText または oText が必要です。' };
    }
  }
  if (section === 'p' && (!input.aText || typeof input.aText !== 'string')) {
    return { valid: false, error: 'P セクションには aText が必要です。' };
  }

  // context バリデーション（オプション）
  if (b.context && typeof b.context === 'object') {
    const ctx = b.context as Record<string, unknown>;

    if (ctx.pipelineDecision && !VALID_DECISIONS.includes(ctx.pipelineDecision as string)) {
      return {
        valid: false,
        error: `pipelineDecision は ${VALID_DECISIONS.join(', ')} のいずれかである必要があります。`,
      };
    }
    if (ctx.pipelinePriority && !VALID_PRIORITIES.includes(ctx.pipelinePriority as string)) {
      return {
        valid: false,
        error: `pipelinePriority は ${VALID_PRIORITIES.join(', ')} のいずれかである必要があります。`,
      };
    }
    if (ctx.riskCategory && !VALID_RISK_CATEGORIES.includes(ctx.riskCategory as string)) {
      return {
        valid: false,
        error: `riskCategory は ${VALID_RISK_CATEGORIES.join(', ')} のいずれかである必要があります。`,
      };
    }
    if (ctx.acwr !== undefined && (typeof ctx.acwr !== 'number' || ctx.acwr < 0 || ctx.acwr > 5)) {
      return { valid: false, error: 'acwr は 0〜5 の数値である必要があります。' };
    }
    if (ctx.nrs !== undefined && (typeof ctx.nrs !== 'number' || ctx.nrs < 0 || ctx.nrs > 10)) {
      return { valid: false, error: 'nrs は 0〜10 の数値である必要があります。' };
    }
  }

  return {
    valid: true,
    data: {
      athleteId: b.athleteId as string,
      section: b.section as SoapSection,
      input: {
        ...(typeof input.sText === 'string' && { sText: input.sText }),
        ...(typeof input.oText === 'string' && { oText: input.oText }),
        ...(typeof input.aText === 'string' && { aText: input.aText }),
        ...(typeof input.pText === 'string' && { pText: input.pText }),
      },
      ...(b.context ? {
        context: {
          ...( (b.context as Record<string, unknown>).pipelineDecision != null && { pipelineDecision: (b.context as Record<string, unknown>).pipelineDecision as string }),
          ...( (b.context as Record<string, unknown>).pipelinePriority != null && { pipelinePriority: (b.context as Record<string, unknown>).pipelinePriority as string }),
          ...( (b.context as Record<string, unknown>).riskCategory != null && { riskCategory: (b.context as Record<string, unknown>).riskCategory as string }),
          ...( (b.context as Record<string, unknown>).acwr != null && { acwr: (b.context as Record<string, unknown>).acwr as number }),
          ...( (b.context as Record<string, unknown>).nrs != null && { nrs: (b.context as Record<string, unknown>).nrs as number }),
          ...( (b.context as Record<string, unknown>).diagnosis != null && { diagnosis: (b.context as Record<string, unknown>).diagnosis as string }),
        },
      } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// テンプレートベース AI 生成
// ---------------------------------------------------------------------------

/**
 * S セクション: 主観的訴えを構造化
 */
function generateSubjective(sText: string): SoapSuggestion {
  // 文を分割してポイントを抽出
  const sentences = sText
    .split(/[。．\.\n、,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const chiefComplaint = sentences[0] ?? sText.slice(0, 50);
  const timeline: string[] = [];
  const relatedSymptoms: string[] = [];

  // キーワードベースの分類
  const timeKeywords = ['から', '前', '後', '日', '週', '月', '昨日', '今朝', '先週', '発症', '受傷'];
  const symptomKeywords = ['痛', '腫', '違和感', '重い', 'だるい', '熱', '痺', 'しびれ', '張り', '硬', '制限', '不安定'];

  for (const sentence of sentences) {
    if (timeKeywords.some((kw) => sentence.includes(kw))) {
      timeline.push(sentence);
    }
    if (symptomKeywords.some((kw) => sentence.includes(kw))) {
      relatedSymptoms.push(sentence);
    }
  }

  const structuredParts: string[] = [
    `【主訴】${chiefComplaint}`,
  ];

  if (timeline.length > 0) {
    structuredParts.push(`【時系列】\n${timeline.map((t) => `  - ${t}`).join('\n')}`);
  }

  if (relatedSymptoms.length > 0) {
    structuredParts.push(
      `【関連症状】\n${relatedSymptoms.map((s) => `  - ${s}`).join('\n')}`
    );
  }

  // 元の入力も保持
  structuredParts.push(`【選手の訴え（原文）】${sText}`);

  const highlights = [chiefComplaint];
  if (timeline.length > 0) highlights.push(`時系列情報 ${timeline.length} 件`);
  if (relatedSymptoms.length > 0) highlights.push(`関連症状 ${relatedSymptoms.length} 件`);

  return {
    text: structuredParts.join('\n\n'),
    confidence: 0.75,
    highlights,
  };
}

/**
 * O セクション: 追加評価項目の提案
 */
function generateObjective(
  oText: string,
  context?: SoapAssistRequestBody['context']
): SoapSuggestion {
  const additionalChecks: string[] = [];
  const highlights: string[] = [];

  // ACWR ベースの提案
  if (context?.acwr !== undefined) {
    if (context.acwr > 1.5) {
      additionalChecks.push('急性慢性負荷比が高値（ACWR > 1.5）— 筋疲労度テスト・関節可動域の詳細評価を推奨');
      additionalChecks.push('過去2週間の練習強度・頻度の変化を確認');
      highlights.push(`ACWR ${context.acwr}（高リスク域）`);
    } else if (context.acwr > 1.3) {
      additionalChecks.push('ACWR が警戒域（1.3-1.5）— 主観的疲労度と客観指標の乖離を確認');
      highlights.push(`ACWR ${context.acwr}（警戒域）`);
    } else if (context.acwr < 0.8) {
      additionalChecks.push('ACWR が低値（< 0.8）— デトレーニングリスク評価、復帰プログラムの段階確認');
      highlights.push(`ACWR ${context.acwr}（低活動域）`);
    } else {
      highlights.push(`ACWR ${context.acwr}（適正範囲）`);
    }
  }

  // NRS ベースの提案
  if (context?.nrs !== undefined) {
    if (context.nrs >= 7) {
      additionalChecks.push('NRS 7以上 — 疼痛の性質（鋭痛/鈍痛）・放散痛の有無・神経学的所見を詳細に記録');
      additionalChecks.push('画像検査の必要性を検討（医師との連携）');
      highlights.push(`NRS ${context.nrs}（重度疼痛）`);
    } else if (context.nrs >= 4) {
      additionalChecks.push('NRS 4-6 — 荷重時痛・運動時痛・安静時痛の区別を記録');
      additionalChecks.push('疼痛誘発テスト・徒手検査の結果を追加');
      highlights.push(`NRS ${context.nrs}（中等度疼痛）`);
    } else if (context.nrs >= 1) {
      highlights.push(`NRS ${context.nrs}（軽度疼痛）`);
    }
  }

  // パイプライン判定ベースの提案
  if (context?.pipelineDecision) {
    switch (context.pipelineDecision) {
      case 'RED':
        additionalChecks.push('RED判定 — バイタルサイン・意識レベル・神経学的スクリーニングの記録を確認');
        additionalChecks.push('受傷機転の詳細と危険因子の特定');
        highlights.push('RED 判定（即時対応）');
        break;
      case 'ORANGE':
        additionalChecks.push('ORANGE判定 — 特殊テスト（該当部位の整形外科的テスト）の追加を推奨');
        highlights.push('ORANGE 判定（要注意）');
        break;
      case 'YELLOW':
        additionalChecks.push('YELLOW判定 — 経時的変化の記録（前回との比較）を推奨');
        highlights.push('YELLOW 判定（観察継続）');
        break;
    }
  }

  // 所見テキストからキーワード抽出
  const oTextLower = oText.toLowerCase();
  if (oTextLower.includes('腫脹') || oTextLower.includes('腫れ')) {
    additionalChecks.push('腫脹の程度 — 周径計測（健側比較）・圧痕テストの実施を推奨');
  }
  if (oTextLower.includes('rom') || oTextLower.includes('可動域')) {
    additionalChecks.push('ROM — ゴニオメーター計測値の記録（自動/他動・疼痛の有無）');
  }
  if (oTextLower.includes('筋力') || oTextLower.includes('mmt')) {
    additionalChecks.push('筋力 — MMT または HHD による客観的筋力値の記録');
  }

  // デフォルトの追加チェック
  if (additionalChecks.length === 0) {
    additionalChecks.push('バイタルサイン（該当する場合）の確認');
    additionalChecks.push('患側と健側の比較評価');
    additionalChecks.push('機能テスト（スポーツ特異的動作テスト）の実施検討');
  }

  const structuredText = [
    `【現在の客観所見】`,
    oText,
    ``,
    `【追加評価の提案】`,
    ...additionalChecks.map((c) => `  - ${c}`),
  ].join('\n');

  return {
    text: structuredText,
    confidence: 0.7,
    highlights,
    additionalChecks,
  };
}

/**
 * A セクション: 鑑別リスト生成
 */
function generateAssessment(
  sText: string | undefined,
  oText: string | undefined,
  context?: SoapAssistRequestBody['context']
): SoapSuggestion {
  const differentials: Differential[] = [];
  const highlights: string[] = [];
  const combinedText = `${sText ?? ''} ${oText ?? ''}`.toLowerCase();

  // リスクカテゴリベースの鑑別
  if (context?.riskCategory) {
    switch (context.riskCategory) {
      case 'overreaching':
        differentials.push(
          { condition: '機能的オーバーリーチング（FOR）', likelihood: 'high' },
          { condition: '非機能的オーバーリーチング（NFOR）', likelihood: 'moderate' },
          { condition: 'オーバートレーニング症候群（OTS）', likelihood: 'low' }
        );
        highlights.push('オーバーリーチングリスク');
        break;
      case 'accumulated_fatigue':
        differentials.push(
          { condition: '蓄積疲労による筋パフォーマンス低下', likelihood: 'high' },
          { condition: '相対的エネルギー不足（RED-S）', likelihood: 'moderate' },
          { condition: '睡眠障害関連の回復遅延', likelihood: 'moderate' }
        );
        highlights.push('蓄積疲労');
        break;
      case 'pain_management':
        differentials.push(
          { condition: '急性軟部組織損傷', likelihood: 'moderate' },
          { condition: '慢性疼痛の急性増悪', likelihood: 'moderate' },
          { condition: '神経因性疼痛', likelihood: 'low' }
        );
        highlights.push('疼痛管理');
        break;
      case 'observation':
        differentials.push(
          { condition: '軽微な筋疲労（経過観察対応）', likelihood: 'high' },
          { condition: '初期段階の組織ストレス', likelihood: 'moderate' }
        );
        highlights.push('経過観察');
        break;
    }
  }

  // テキストベースのキーワード鑑別
  if (combinedText.includes('膝') || combinedText.includes('knee')) {
    differentials.push(
      { condition: '膝関節周囲の軟部組織損傷', likelihood: 'moderate' },
      { condition: '膝蓋大腿関節障害', likelihood: 'moderate' }
    );
  }
  if (combinedText.includes('肩') || combinedText.includes('shoulder')) {
    differentials.push(
      { condition: '肩関節周囲の機能障害', likelihood: 'moderate' },
      { condition: 'インピンジメント症候群', likelihood: 'moderate' }
    );
  }
  if (combinedText.includes('腰') || combinedText.includes('low back')) {
    differentials.push(
      { condition: '腰部筋筋膜性疼痛', likelihood: 'moderate' },
      { condition: '椎間板関連障害', likelihood: 'low' }
    );
  }
  if (combinedText.includes('足首') || combinedText.includes('ankle')) {
    differentials.push(
      { condition: '足関節靭帯損傷', likelihood: 'moderate' },
      { condition: '足関節不安定症', likelihood: 'moderate' }
    );
  }

  // 診断情報がある場合
  if (context?.diagnosis) {
    differentials.unshift({
      condition: context.diagnosis,
      likelihood: 'high',
    });
    highlights.push(`既存診断: ${context.diagnosis}`);
  }

  // デフォルト（何も該当しない場合）
  if (differentials.length === 0) {
    differentials.push(
      { condition: '筋骨格系の機能障害（部位特定要）', likelihood: 'moderate' },
      { condition: '疲労関連のパフォーマンス低下', likelihood: 'moderate' }
    );
  }

  // 重症度の示唆
  let severityHint = '軽度〜中等度';
  if (context?.nrs !== undefined && context.nrs >= 7) {
    severityHint = '重度';
  } else if (context?.nrs !== undefined && context.nrs >= 4) {
    severityHint = '中等度';
  }
  if (context?.pipelineDecision === 'RED') {
    severityHint = '重度（即時対応要）';
  }

  const structuredText = [
    `【臨床的評価】`,
    `重症度の示唆: ${severityHint}`,
    ``,
    `【鑑別リスト】`,
    ...differentials.map(
      (d) => `  - ${d.condition}（可能性: ${d.likelihood === 'high' ? '高' : d.likelihood === 'moderate' ? '中' : '低'}）`
    ),
    ``,
    `※ 上記は AI による参考提案です。臨床的判断はスタッフの責任において行ってください。`,
    `※ 確定診断は医師のみが行えます。`,
  ].join('\n');

  highlights.push(`鑑別 ${differentials.length} 件`);

  return {
    text: structuredText,
    confidence: 0.65,
    highlights,
    differentials,
  };
}

/**
 * P セクション: 介入プラン生成
 */
function generatePlan(
  aText: string,
  context?: SoapAssistRequestBody['context']
): SoapSuggestion {
  const highlights: string[] = [];
  const interventions: string[] = [];
  const followUpDates: string[] = [];

  const today = new Date();

  // リスクカテゴリベースの介入計画
  if (context?.riskCategory) {
    switch (context.riskCategory) {
      case 'overreaching':
        interventions.push('負荷量の一時的軽減（現在の 60-70% に調整）');
        interventions.push('回復プロトコル強化（睡眠指導・栄養指導）');
        interventions.push('主観的疲労度の日次モニタリング継続');
        followUpDates.push(formatDate(addDays(today, 3)));
        followUpDates.push(formatDate(addDays(today, 7)));
        highlights.push('負荷調整プラン');
        break;
      case 'accumulated_fatigue':
        interventions.push('アクティブリカバリーセッションの導入');
        interventions.push('睡眠の質向上のための環境調整指導');
        interventions.push('ACWR の段階的正常化プログラム');
        followUpDates.push(formatDate(addDays(today, 2)));
        followUpDates.push(formatDate(addDays(today, 7)));
        followUpDates.push(formatDate(addDays(today, 14)));
        highlights.push('疲労回復プログラム');
        break;
      case 'pain_management':
        interventions.push('疼痛管理プロトコル（物理療法・徒手療法の併用）');
        interventions.push('段階的負荷プログレッション（疼痛フリーの範囲内）');
        interventions.push('NRS による疼痛モニタリング（練習前後）');
        if (context?.nrs !== undefined && context.nrs >= 7) {
          interventions.push('医師への紹介検討（画像検査・薬物療法の必要性評価）');
          followUpDates.push(formatDate(addDays(today, 1)));
        }
        followUpDates.push(formatDate(addDays(today, 3)));
        followUpDates.push(formatDate(addDays(today, 7)));
        highlights.push('疼痛管理プロトコル');
        break;
      case 'observation':
        interventions.push('現行トレーニングの継続（通常負荷）');
        interventions.push('セルフモニタリングの指導（症状変化時の報告）');
        followUpDates.push(formatDate(addDays(today, 7)));
        highlights.push('経過観察');
        break;
    }
  }

  // パイプライン判定ベースの追加介入
  if (context?.pipelineDecision === 'RED') {
    interventions.unshift('即時対応: 活動制限・安全確保');
    interventions.push('医療チームへの引き継ぎ準備');
    if (!followUpDates.includes(formatDate(addDays(today, 1)))) {
      followUpDates.unshift(formatDate(addDays(today, 1)));
    }
    highlights.push('RED — 即時対応');
  } else if (context?.pipelineDecision === 'ORANGE') {
    interventions.push('24時間以内の再評価を予定');
    if (!followUpDates.includes(formatDate(addDays(today, 1)))) {
      followUpDates.unshift(formatDate(addDays(today, 1)));
    }
    highlights.push('ORANGE — 24h再評価');
  }

  // ACWR ベースの追加提案
  if (context?.acwr !== undefined) {
    if (context.acwr > 1.5) {
      interventions.push(`ACWR 是正: 急性負荷を 10-15% 段階的に減少`);
    } else if (context.acwr < 0.8) {
      interventions.push(`ACWR 是正: 急性負荷を 10-15% 段階的に増加（漸増原則）`);
    }
  }

  // デフォルト（何も該当しない場合）
  if (interventions.length === 0) {
    interventions.push('個別対応プランの策定（評価結果に基づく）');
    interventions.push('継続的モニタリング');
    followUpDates.push(formatDate(addDays(today, 7)));
  }

  // フォローアップ日程のソート・重複排除
  const uniqueFollowUps = [...new Set(followUpDates)].sort();

  const structuredText = [
    `【介入プラン】`,
    ...interventions.map((i, idx) => `  ${idx + 1}. ${i}`),
    ``,
    `【フォローアップ日程】`,
    ...uniqueFollowUps.map((d) => `  - ${d}`),
    ``,
    `【備考】`,
    `  - 上記は AI による参考提案です。臨床的判断に基づき適宜修正してください。`,
    `  - エビデンスレベルや個別の既往歴を考慮した最終判断はスタッフに委ねられます。`,
  ].join('\n');

  return {
    text: structuredText,
    confidence: 0.7,
    highlights,
    followUpDates: uniqueFollowUps,
  };
}

/**
 * Full セクション: S/O/A/P 全セクションを処理
 */
function generateFull(
  input: SoapAssistRequestBody['input'],
  context?: SoapAssistRequestBody['context']
): SoapSuggestion {
  const parts: string[] = [];
  const allHighlights: string[] = [];
  const allDifferentials: Differential[] = [];
  const allFollowUpDates: string[] = [];
  const allAdditionalChecks: string[] = [];

  // S セクション
  if (input.sText) {
    const sResult = generateSubjective(input.sText);
    parts.push(`=== S（主観的所見） ===\n${sResult.text}`);
    allHighlights.push(...sResult.highlights);
  }

  // O セクション
  if (input.oText) {
    const oResult = generateObjective(input.oText, context);
    parts.push(`=== O（客観的所見） ===\n${oResult.text}`);
    allHighlights.push(...oResult.highlights);
    if (oResult.additionalChecks) allAdditionalChecks.push(...oResult.additionalChecks);
  }

  // A セクション
  if (input.sText || input.oText) {
    const aResult = generateAssessment(input.sText, input.oText, context);
    parts.push(`=== A（評価） ===\n${aResult.text}`);
    allHighlights.push(...aResult.highlights);
    if (aResult.differentials) allDifferentials.push(...aResult.differentials);
  }

  // P セクション
  if (input.aText) {
    const pResult = generatePlan(input.aText, context);
    parts.push(`=== P（計画） ===\n${pResult.text}`);
    allHighlights.push(...pResult.highlights);
    if (pResult.followUpDates) allFollowUpDates.push(...pResult.followUpDates);
  }

  return {
    text: parts.join('\n\n'),
    confidence: 0.65,
    highlights: allHighlights,
    ...(allAdditionalChecks.length > 0 && { additionalChecks: allAdditionalChecks }),
    ...(allDifferentials.length > 0 && { differentials: allDifferentials }),
    ...(allFollowUpDates.length > 0 && { followUpDates: [...new Set(allFollowUpDates)].sort() }),
  };
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

// ---------------------------------------------------------------------------
// POST /api/ai/soap-assist
// ---------------------------------------------------------------------------

export async function POST(
  request: Request
): Promise<NextResponse<SoapAssistSuccessResponse | SoapAssistErrorResponse>> {
  const startTime = Date.now();

  try {
    // ----- 1. 認証チェック -----
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

    // ----- スタッフ確認 & org_id 取得 -----
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, org_id')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { success: false, error: 'スタッフ権限が必要です。' },
        { status: 403 }
      );
    }

    // ----- プランゲートチェック -----
    const accessResult = await canAccess(supabase, staff.org_id as string, 'feature_ai_soap');
    if (!accessResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: accessResult.reason ?? 'AI SOAP アシスト機能には Pro プラン以上が必要です。プランをアップグレードしてください。',
        },
        { status: 403 }
      );
    }

    // ----- 2. リクエストボディパース & バリデーション -----
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'リクエストボディの JSON パースに失敗しました。' },
        { status: 400 }
      );
    }

    const validation = validateRequestBody(rawBody);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const { section, input, context } = validation.data;

    // ----- 3. テンプレートベース AI 生成 -----
    let suggestion: SoapSuggestion;

    switch (section) {
      case 's':
        suggestion = generateSubjective(input.sText!);
        break;
      case 'o':
        suggestion = generateObjective(input.oText!, context);
        break;
      case 'a':
        suggestion = generateAssessment(input.sText, input.oText, context);
        break;
      case 'p':
        suggestion = generatePlan(input.aText!, context);
        break;
      case 'full':
        suggestion = generateFull(input, context);
        break;
      default:
        return NextResponse.json(
          { success: false, error: '不正なセクション指定です。' },
          { status: 400 }
        );
    }

    // ----- 4. レスポンス -----
    const processingTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        section,
        suggestion,
        metadata: {
          model: 'template-v1' as const,
          processingTime,
        },
      },
    });
  } catch (err) {
    console.error('[ai/soap-assist] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 }
    );
  }
}
