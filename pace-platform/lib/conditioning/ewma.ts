/**
 * PACE Platform — EWMA（指数加重移動平均）計算モジュール
 *
 * コンディショニングスコアエンジンで使用する EWMA 計算ロジック。
 * フィットネス（42日スパン）と疲労（7日スパン）の時系列平滑化に使用。
 *
 * EWMA の計算式:
 *   α = 2 / (span + 1)
 *   S_t = α × x_t + (1 - α) × S_{t-1}
 *   S_0 = x_0（初期値は最初のデータポイント）
 */

import type { EWMAConfig } from "./types";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** フィットネス EWMA のデフォルトスパン（日数）*/
export const FITNESS_EWMA_SPAN = 42;

/** 疲労 EWMA のデフォルトスパン（日数）*/
export const FATIGUE_EWMA_SPAN = 7;

// ---------------------------------------------------------------------------
// EWMA 設定ヘルパー
// ---------------------------------------------------------------------------

/**
 * スパンから EWMA 設定を生成する。
 *
 * @param span EWMA のスパン（日数）。1 以上の正の整数であること。
 * @returns EWMAConfig オブジェクト
 * @throws span が 1 未満の場合
 */
export function createEWMAConfig(span: number): EWMAConfig {
  if (span < 1) {
    throw new RangeError(
      `[conditioning:ewma] span は 1 以上の正の整数である必要があります: ${span}`
    );
  }

  return {
    span,
    smoothingFactor: 2 / (span + 1),
  };
}

// ---------------------------------------------------------------------------
// EWMA 計算
// ---------------------------------------------------------------------------

/**
 * 時系列データの EWMA（指数加重移動平均）を計算する。
 *
 * 時系列は古い順（index 0 = 最古）で渡すこと。
 * NaN / Infinity の値はスキップされる（直前の EWMA 値を維持）。
 *
 * @param values 時系列データ（古い順）
 * @param span   EWMA のスパン（日数）
 * @returns 最新の EWMA 値。空配列の場合は 0 を返す。
 */
export function calculateEWMA(values: number[], span: number): number {
  // 有効な数値のみをフィルタリング
  const validValues = values.filter(
    (v) => typeof v === "number" && Number.isFinite(v)
  );

  if (validValues.length === 0) {
    return 0;
  }

  if (validValues.length === 1) {
    return validValues[0]!;
  }

  const alpha = 2 / (span + 1);

  // 初期値は最初のデータポイント
  let ewma = validValues[0]!;

  // 再帰的に EWMA を更新
  for (let i = 1; i < validValues.length; i++) {
    ewma = alpha * validValues[i]! + (1 - alpha) * ewma;
  }

  return ewma;
}

/**
 * 時系列データの EWMA を EWMAConfig を使って計算する。
 *
 * @param values 時系列データ（古い順）
 * @param config EWMA 設定
 * @returns 最新の EWMA 値
 */
export function calculateEWMAWithConfig(
  values: number[],
  config: EWMAConfig
): number {
  return calculateEWMA(values, config.span);
}
