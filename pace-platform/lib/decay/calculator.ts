/**
 * PACE Platform — 時間減衰計算（Pure Functions）
 *
 * PRD Phase 3 の半減期モデルに基づくリスク値の時間減衰計算。
 *
 *   Risk(t) = Risk(0) × e^(-λ × t) × chronicModifier
 *
 * すべて純関数で副作用なし。テスタブルな設計。
 */

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** リスク値がこの閾値以下になったら「回復済み」とみなす */
export const RISK_THRESHOLD = 0.05;

/** clamp の上下限 */
const RISK_MIN = 0;
const RISK_MAX = 1;

// ---------------------------------------------------------------------------
// 減衰計算
// ---------------------------------------------------------------------------

/**
 * 時間減衰後のリスク値を計算する。
 *
 * @param initialRisk - 検出時のリスク値 Risk(0)（0〜1）
 * @param lambda - 減衰定数 λ（> 0）
 * @param daysSinceDetection - 検出からの経過日数（>= 0）
 * @param chronicModifier - 繰り返し受傷の修正係数（デフォルト 1.0）
 *   - 1.0: 標準減衰
 *   - > 1.0: 減衰が遅い（リスクが高めに維持される）
 * @returns 減衰後のリスク値（0〜1 にクランプ）
 *
 * @example
 * ```ts
 * // 初期リスク 0.8、半減期 14日 の λ で 7日後
 * const lambda = lambdaFromHalfLife(14);
 * const risk = calculateDecayedRisk(0.8, lambda, 7);
 * // => 約 0.566（半分の時間で sqrt(0.5) 倍）
 * ```
 */
export function calculateDecayedRisk(
  initialRisk: number,
  lambda: number,
  daysSinceDetection: number,
  chronicModifier: number = 1.0
): number {
  if (daysSinceDetection < 0) {
    return clamp(initialRisk);
  }
  if (lambda <= 0) {
    // λ が 0 以下なら減衰しない
    return clamp(initialRisk * chronicModifier);
  }

  // Risk(t) = Risk(0) × e^(-λ × t)
  const decayedBase = initialRisk * Math.exp(-lambda * daysSinceDetection);

  // chronicModifier > 1.0 はリスクを高めに維持する（減衰を遅らせる効果）
  const result = decayedBase * chronicModifier;

  return clamp(result);
}

// ---------------------------------------------------------------------------
// λ ⇔ 半減期 変換
// ---------------------------------------------------------------------------

/**
 * 半減期（日数）から減衰定数 λ を算出する。
 *
 * λ = ln(2) / halfLifeDays
 *
 * @param halfLifeDays - 半減期（日数、> 0）
 * @returns 減衰定数 λ
 *
 * @example
 * ```ts
 * const lambda = lambdaFromHalfLife(14); // => 約 0.0495
 * ```
 */
export function lambdaFromHalfLife(halfLifeDays: number): number {
  if (halfLifeDays <= 0) {
    throw new Error(
      `半減期は正の値である必要があります: halfLifeDays=${halfLifeDays}`
    );
  }
  return Math.LN2 / halfLifeDays;
}

/**
 * 減衰定数 λ から半減期（日数）を算出する。
 *
 * halfLifeDays = ln(2) / λ
 *
 * @param lambda - 減衰定数 λ（> 0）
 * @returns 半減期（日数）
 */
export function halfLifeFromLambda(lambda: number): number {
  if (lambda <= 0) {
    throw new Error(
      `λ は正の値である必要があります: lambda=${lambda}`
    );
  }
  return Math.LN2 / lambda;
}

// ---------------------------------------------------------------------------
// 回復日数推定
// ---------------------------------------------------------------------------

/**
 * リスク値が指定閾値を下回るまでの日数を計算する。
 *
 * Risk(t) = initialRisk × e^(-λt) < threshold
 * t > -ln(threshold / initialRisk) / λ
 *
 * @param initialRisk - 検出時のリスク値（0〜1）
 * @param lambda - 減衰定数 λ（> 0）
 * @param threshold - 回復とみなす閾値（デフォルト 0.05）
 * @returns 閾値を下回るまでの推定日数（切り上げ）
 *
 * @example
 * ```ts
 * const days = daysUntilThreshold(0.8, lambdaFromHalfLife(14), 0.05);
 * // => 約 56日（半減期 14日 × 4回分で 0.8 → 0.05）
 * ```
 */
export function daysUntilThreshold(
  initialRisk: number,
  lambda: number,
  threshold: number = RISK_THRESHOLD
): number {
  if (initialRisk <= threshold) {
    return 0;
  }
  if (lambda <= 0) {
    return Infinity;
  }
  if (threshold <= 0) {
    return Infinity;
  }

  const days = -Math.log(threshold / initialRisk) / lambda;
  return Math.ceil(days);
}

// ---------------------------------------------------------------------------
// 経過日数計算
// ---------------------------------------------------------------------------

/**
 * 2つの日付間の経過日数を算出する。
 *
 * @param detectedAt - 検出日
 * @param currentDate - 現在日（デフォルト: 今日）
 * @returns 経過日数（小数含む）
 */
export function daysBetween(
  detectedAt: Date,
  currentDate: Date = new Date()
): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return (currentDate.getTime() - detectedAt.getTime()) / msPerDay;
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * 値を [0, 1] にクランプする。
 */
function clamp(value: number): number {
  return Math.max(RISK_MIN, Math.min(RISK_MAX, value));
}
