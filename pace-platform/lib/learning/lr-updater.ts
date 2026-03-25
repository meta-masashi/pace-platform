/**
 * PACE Platform — LR（尤度比）更新エンジン（Pure Functions）
 *
 * リアルワールドのアセスメント結果と受傷アウトカムから
 * 経験的 LR を算出し、既存の LR 値をスムーズに更新する。
 *
 * 更新方式:
 *   newLR = currentLR × 0.7 + empiricalLR × 0.3（加重平均ブレンド）
 *
 * 安全機構:
 *   - 最小サンプルサイズ（デフォルト 30）以上で初めて更新
 *   - Wilson スコア信頼区間による信頼度評価
 *   - CSV ベースラインから ±50% 以上の逸脱はフラグ
 *
 * すべて純関数で副作用なし。テスタブルな設計。
 */

import type { LearningDataPoint, LRUpdateResult } from "./types";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 加重平均における既存 LR の重み */
const EXISTING_WEIGHT = 0.7;

/** 加重平均における経験的 LR の重み */
const EMPIRICAL_WEIGHT = 0.3;

/** デフォルトの最小サンプルサイズ */
const DEFAULT_MIN_SAMPLE_SIZE = 30;

/** 安全バウンドの逸脱率上限（50%） */
const SAFETY_DEVIATION_LIMIT = 0.5;

/** LR の下限（ゼロ除算防止） */
const LR_FLOOR = 0.01;

/** LR の上限（極端な値を防止） */
const LR_CEILING = 100;

// ---------------------------------------------------------------------------
// コア LR 更新
// ---------------------------------------------------------------------------

/**
 * データポイントから更新された LR 値を算出する。
 *
 * 処理フロー:
 * 1. データポイントから 2x2 分割表を構築（TP, FP, TN, FN）
 * 2. 感度・特異度を算出
 * 3. 経験的 LR+ = sensitivity / (1 - specificity) を算出
 * 4. 既存 LR との加重平均ブレンド（70/30）
 * 5. Wilson スコア信頼区間による信頼度評価
 * 6. CSV ベースラインからの逸脱チェック
 *
 * @param dataPoints - 対象ノードの学習データポイント配列
 * @param currentLR - 現在のノード LR 値
 * @param originalCsvLR - CSV ベースラインの LR 値（安全バウンド用、省略時は currentLR）
 * @param minSampleSize - 更新に必要な最小サンプルサイズ（デフォルト 30）
 * @returns LR 更新結果（サンプル不足の場合は更新なし）
 */
export function calculateUpdatedLR(
  dataPoints: LearningDataPoint[],
  currentLR: number,
  originalCsvLR?: number,
  minSampleSize: number = DEFAULT_MIN_SAMPLE_SIZE
): LRUpdateResult {
  const nodeId = dataPoints.length > 0 ? dataPoints[0]!.nodeId : "unknown";
  const n = dataPoints.length;
  const csvLR = originalCsvLR ?? currentLR;

  // サンプル不足 — 更新せず現在値を返す
  if (n < minSampleSize) {
    return {
      nodeId,
      previousLR: currentLR,
      updatedLR: currentLR,
      sampleSize: n,
      confidence: 0,
      isWithinSafetyBounds: true,
    };
  }

  // ----- 2x2 分割表の構築 -----
  const { tp, fp, tn, fn } = buildContingencyTable(dataPoints);

  // ----- 感度・特異度の算出 -----
  const sensitivity = calculateSensitivity(tp, fn);
  const specificity = calculateSpecificity(tn, fp);

  // ----- 経験的 LR の算出 -----
  const empiricalLR = calculateEmpiricalLR(sensitivity, specificity);

  // ----- 加重平均ブレンド -----
  const blendedLR = blendLR(currentLR, empiricalLR);

  // ----- クランプ -----
  const clampedLR = clampLR(blendedLR);

  // ----- Wilson スコア信頼度 -----
  const confidence = calculateWilsonConfidenceWidth(tp + fn > 0 ? sensitivity : 0.5, tp + fn);

  // ----- 安全バウンドチェック -----
  const isWithinSafetyBounds = checkSafetyBounds(clampedLR, csvLR);

  return {
    nodeId,
    previousLR: currentLR,
    updatedLR: clampedLR,
    sampleSize: n,
    confidence,
    isWithinSafetyBounds,
  };
}

// ---------------------------------------------------------------------------
// 2x2 分割表
// ---------------------------------------------------------------------------

/**
 * 2x2 分割表の各セル値。
 */
interface ContingencyTable {
  /** 真陽性: ノード陽性 & 受傷あり */
  tp: number;
  /** 偽陽性: ノード陽性 & 受傷なし */
  fp: number;
  /** 真陰性: ノード陰性 & 受傷なし */
  tn: number;
  /** 偽陰性: ノード陰性 & 受傷あり */
  fn: number;
}

/**
 * データポイントから 2x2 分割表を構築する。
 *
 * @param dataPoints - 学習データポイント配列
 * @returns 分割表
 */
export function buildContingencyTable(
  dataPoints: LearningDataPoint[]
): ContingencyTable {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (const dp of dataPoints) {
    if (dp.wasPositive && dp.injuryOccurred) {
      tp++;
    } else if (dp.wasPositive && !dp.injuryOccurred) {
      fp++;
    } else if (!dp.wasPositive && !dp.injuryOccurred) {
      tn++;
    } else {
      // !wasPositive && injuryOccurred
      fn++;
    }
  }

  return { tp, fp, tn, fn };
}

// ---------------------------------------------------------------------------
// 感度・特異度
// ---------------------------------------------------------------------------

/**
 * 感度（Sensitivity）を算出する。
 *
 * Sensitivity = TP / (TP + FN)
 *
 * 分母が 0 の場合は 0.5（不確定）を返す。
 *
 * @param tp - 真陽性数
 * @param fn - 偽陰性数
 * @returns 感度（0〜1）
 */
export function calculateSensitivity(tp: number, fn: number): number {
  const denominator = tp + fn;
  if (denominator === 0) return 0.5;
  return tp / denominator;
}

/**
 * 特異度（Specificity）を算出する。
 *
 * Specificity = TN / (TN + FP)
 *
 * 分母が 0 の場合は 0.5（不確定）を返す。
 *
 * @param tn - 真陰性数
 * @param fp - 偽陽性数
 * @returns 特異度（0〜1）
 */
export function calculateSpecificity(tn: number, fp: number): number {
  const denominator = tn + fp;
  if (denominator === 0) return 0.5;
  return tn / denominator;
}

// ---------------------------------------------------------------------------
// 経験的 LR
// ---------------------------------------------------------------------------

/**
 * 経験的 LR+（陽性尤度比）を算出する。
 *
 * LR+ = Sensitivity / (1 - Specificity)
 *
 * 特異度が 1.0（完全特異度）の場合は上限値を返す。
 *
 * @param sensitivity - 感度
 * @param specificity - 特異度
 * @returns 経験的 LR+
 */
export function calculateEmpiricalLR(
  sensitivity: number,
  specificity: number
): number {
  const falsePositiveRate = 1 - specificity;

  // 偽陽性率が 0（完全な特異度）→ LR は理論上無限大だが上限でクランプ
  if (falsePositiveRate <= 0) {
    return LR_CEILING;
  }

  // 感度が 0 → LR は 0 だが下限でクランプ
  if (sensitivity <= 0) {
    return LR_FLOOR;
  }

  return sensitivity / falsePositiveRate;
}

// ---------------------------------------------------------------------------
// 加重平均ブレンド
// ---------------------------------------------------------------------------

/**
 * 既存 LR と経験的 LR の加重平均ブレンドを算出する。
 *
 * newLR = currentLR × 0.7 + empiricalLR × 0.3
 *
 * 急激な変化を避けるスムーズ更新。
 *
 * @param currentLR - 既存の LR 値
 * @param empiricalLR - 経験的 LR 値
 * @returns ブレンド後の LR 値
 */
export function blendLR(currentLR: number, empiricalLR: number): number {
  return currentLR * EXISTING_WEIGHT + empiricalLR * EMPIRICAL_WEIGHT;
}

// ---------------------------------------------------------------------------
// クランプ
// ---------------------------------------------------------------------------

/**
 * LR 値を安全な範囲 [LR_FLOOR, LR_CEILING] にクランプする。
 *
 * @param lr - LR 値
 * @returns クランプ後の LR 値
 */
export function clampLR(lr: number): number {
  return Math.max(LR_FLOOR, Math.min(LR_CEILING, lr));
}

// ---------------------------------------------------------------------------
// Wilson スコア信頼区間
// ---------------------------------------------------------------------------

/**
 * Wilson スコア信頼区間の幅を算出する。
 *
 * サンプルサイズの十分性を評価する指標として使用。
 * 幅が小さいほど信頼性が高い。
 *
 * z = 1.96（95% 信頼区間）
 *
 * Wilson Score CI:
 *   center = (p + z²/(2n)) / (1 + z²/n)
 *   halfWidth = z × sqrt(p(1-p)/n + z²/(4n²)) / (1 + z²/n)
 *   CI = [center - halfWidth, center + halfWidth]
 *   width = 2 × halfWidth
 *
 * @param proportion - 観測比率（例: 感度）
 * @param n - サンプルサイズ
 * @returns 信頼区間の幅（0〜1）
 */
export function calculateWilsonConfidenceWidth(
  proportion: number,
  n: number
): number {
  if (n <= 0) return 1; // データなし → 最大不確実性

  const z = 1.96; // 95% CI
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const pq = proportion * (1 - proportion);

  const halfWidth =
    (z * Math.sqrt(pq / n + z2 / (4 * n * n))) / denominator;

  return halfWidth * 2; // 全幅を返す
}

// ---------------------------------------------------------------------------
// 安全バウンドチェック
// ---------------------------------------------------------------------------

/**
 * 更新後の LR が CSV ベースラインから ±50% 以内かチェックする。
 *
 * |newLR - csvLR| / csvLR > 0.5 の場合はヒューマンレビューが必要。
 *
 * @param newLR - 更新後の LR 値
 * @param csvLR - CSV ベースラインの LR 値
 * @returns 安全バウンド内なら true
 */
export function checkSafetyBounds(newLR: number, csvLR: number): boolean {
  if (csvLR <= 0) return false;
  const deviation = Math.abs(newLR - csvLR) / csvLR;
  return deviation <= SAFETY_DEVIATION_LIMIT;
}

/**
 * CSV ベースラインからの乖離率（%）を算出する。
 *
 * @param newLR - 更新後の LR 値
 * @param csvLR - CSV ベースラインの LR 値
 * @returns 乖離率（0〜∞、百分率）
 */
export function calculateDeviationPct(newLR: number, csvLR: number): number {
  if (csvLR <= 0) return Infinity;
  return Math.abs(newLR - csvLR) / csvLR;
}
