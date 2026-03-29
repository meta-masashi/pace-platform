/**
 * What-If フロントエンド Safety Clamp
 *
 * スライダーの極端な入力値をODE発散前にクランプ。
 * 生理学的限界を超える値がバックエンドに到達するのを防ぐ。
 */

/** 生理学的限界値（ハードリミット） */
export const PHYSIOLOGICAL_LIMITS = {
  /** 負荷スケール最小 (%) */
  LOAD_SCALE_MIN: 0,
  /** 負荷スケール最大 (%) — 100% = フルメニュー消化 */
  LOAD_SCALE_MAX: 100,
  /** sRPE の上限 */
  SRPE_MAX: 10,
  /** トレーニング時間の上限 (分) — 6時間 */
  DURATION_MAX: 360,
  /** 組織ダメージの表示上限 */
  DAMAGE_DISPLAY_MAX: 100,
  /** 走行距離の上限 (km) — マラソン超はスポーツ医学的に別ドメイン */
  DISTANCE_MAX: 50,
} as const;

/**
 * 負荷スケール値をクランプ
 *
 * @param scale - ユーザー入力のスケール値 (%)
 * @returns クランプ済みのスケール値 [0, 200]
 */
export function clampLoadScale(scale: number): number {
  if (!Number.isFinite(scale)) return 100; // NaN/Infinity → default
  return Math.max(
    PHYSIOLOGICAL_LIMITS.LOAD_SCALE_MIN,
    Math.min(PHYSIOLOGICAL_LIMITS.LOAD_SCALE_MAX, Math.round(scale))
  );
}

/**
 * sRPE 値をクランプ
 */
export function clampSrpe(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(0, Math.min(PHYSIOLOGICAL_LIMITS.SRPE_MAX, value));
}

/**
 * 任意の数値を安全範囲にクランプ + NaN/Infinity ガード
 */
export function safeClamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

/**
 * ダメージ値の表示用フォーマット
 * NaN/Infinity が混入した場合でも安全に表示
 */
export function formatDamage(damage: number): string {
  if (!Number.isFinite(damage)) return "—";
  return Math.round(Math.max(0, Math.min(100, damage)) * 10 / 10).toFixed(1);
}
