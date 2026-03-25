/**
 * PACE Platform — リルート NLG（決定論的テンプレート）
 *
 * リルート提案の通知テキストを生成する。
 * Gemini を使用せず、テンプレートベースで確定的なテキストを生成する。
 *
 * テンプレート:
 *   "復帰スケジュールが自動的に再調整されました。
 *    {reason}のため、{adjustments}。
 *    新しい復帰予定日: {newRTS}"
 */

import type { RerouteProposal, RerouteReason, RerouteAdjustment } from './types';

// ---------------------------------------------------------------------------
// 理由テンプレート
// ---------------------------------------------------------------------------

/** リルート理由の日本語テンプレート */
const REASON_TEMPLATES: Record<RerouteReason, string> = {
  recovery_slower_than_expected: '回復ペースが予測より遅い',
  recovery_faster_than_expected: '回復ペースが予測より速い',
  pain_increase: '痛みスコア（NRS）が3日連続で上昇している',
  rom_regression: '可動域（ROM）の退行が検出された',
  subjective_decline: '主観的コンディションが3日連続で低下している',
};

/** 深刻度の日本語テンプレート */
const SEVERITY_LABELS: Record<string, string> = {
  minor: '軽度',
  moderate: '中度',
  major: '重度',
};

// ---------------------------------------------------------------------------
// パブリック API
// ---------------------------------------------------------------------------

/**
 * リルート提案の NLG テキストを生成する。
 *
 * @param proposal - リルート提案
 * @returns 日本語の通知テキスト
 */
export function generateRerouteNLG(proposal: RerouteProposal): string {
  const { detection, adjustments, newEstimatedRTS } = proposal;

  const reasonText = REASON_TEMPLATES[detection.reason] ?? detection.reason;
  const severityText = SEVERITY_LABELS[detection.severity] ?? detection.severity;
  const adjustmentText = formatAdjustments(adjustments);
  const rtsDateText = formatDateJP(newEstimatedRTS);

  const totalDaysImpact = adjustments.reduce((sum, a) => sum + a.daysImpact, 0);
  const impactDirection = totalDaysImpact > 0 ? '延長' : totalDaysImpact < 0 ? '短縮' : '変更なし';
  const impactDays = Math.abs(totalDaysImpact);

  const lines = [
    `復帰スケジュールが自動的に再調整されました。`,
    ``,
    `【検出】${severityText}の偏差: ${reasonText}`,
    `【調整内容】${adjustmentText}`,
    `【影響】復帰予定が${impactDays}日${impactDirection}`,
    `【新しい復帰予定日】${rtsDateText}`,
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 内部関数
// ---------------------------------------------------------------------------

/**
 * 調整リストをテキスト化する。
 */
function formatAdjustments(adjustments: RerouteAdjustment[]): string {
  if (adjustments.length === 0) return '調整なし';

  return adjustments
    .map((a) => a.description)
    .join('、');
}

/**
 * Date を日本語表示にフォーマットする。
 */
function formatDateJP(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
