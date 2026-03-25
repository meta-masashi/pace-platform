/**
 * What-If シミュレーション: クライアントサイド補間エンジン
 *
 * 5点のグリッドデータを元に、スライダー操作中はゼロ・レイテンシで
 * 近似値を返す。操作完了後に厳密解で差し替える。
 */

export interface GridPoint {
  scale: number;
  predicted_damage: number;
  repair_rate: number;
  status: "GREEN" | "YELLOW" | "ORANGE" | "RED";
  d_crit: number;
}

export interface InterpolatedResult {
  predicted_damage: number;
  repair_rate: number;
  status: "GREEN" | "YELLOW" | "ORANGE" | "RED";
  is_estimated: boolean;
}

/**
 * 線形補間（Linear Interpolation）
 *
 * 任意の scale 値に対し、隣接する2つのグリッド点から線形補間で推定。
 * グリッド範囲外はクランプ（外挿しない）。
 */
export function interpolateLinear(
  grid: GridPoint[],
  scale: number
): InterpolatedResult {
  if (grid.length === 0) {
    return { predicted_damage: 0, repair_rate: 0, status: "GREEN", is_estimated: true };
  }

  // Sort grid by scale (defensive)
  const sorted = [...grid].sort((a, b) => a.scale - b.scale);

  // Clamp to grid range
  const minScale = sorted[0].scale;
  const maxScale = sorted[sorted.length - 1].scale;
  const clampedScale = Math.max(minScale, Math.min(maxScale, scale));

  // Find bracketing points
  let lo = sorted[0];
  let hi = sorted[sorted.length - 1];

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].scale <= clampedScale && sorted[i + 1].scale >= clampedScale) {
      lo = sorted[i];
      hi = sorted[i + 1];
      break;
    }
  }

  // Exact match
  if (lo.scale === hi.scale) {
    return {
      predicted_damage: lo.predicted_damage,
      repair_rate: lo.repair_rate,
      status: lo.status,
      is_estimated: true,
    };
  }

  // Linear interpolation factor
  const t = (clampedScale - lo.scale) / (hi.scale - lo.scale);

  const damage = lo.predicted_damage + t * (hi.predicted_damage - lo.predicted_damage);
  const repair = lo.repair_rate + t * (hi.repair_rate - lo.repair_rate);

  // Clamp damage to [0, 100]
  const clampedDamage = Math.max(0, Math.min(100, damage));

  // Interpolate d_crit for status classification
  const dCrit = lo.d_crit + t * (hi.d_crit - lo.d_crit);
  const ratio = clampedDamage / Math.max(dCrit, 0.01);

  let status: InterpolatedResult["status"];
  if (ratio >= 1.0) status = "RED";
  else if (ratio >= 0.8) status = "ORANGE";
  else if (ratio >= 0.5) status = "YELLOW";
  else status = "GREEN";

  return {
    predicted_damage: Math.round(clampedDamage * 10) / 10,
    repair_rate: Math.round(repair * 100) / 100,
    status,
    is_estimated: true,
  };
}

/**
 * Catmull-Rom スプライン補間
 *
 * 線形補間よりも滑らかなカーブを生成。
 * 非線形 ODE の特性（指数的増加）をより正確に近似する。
 */
export function interpolateSpline(
  grid: GridPoint[],
  scale: number
): InterpolatedResult {
  if (grid.length < 4) {
    // 4点未満ではスプラインが不安定なため線形にフォールバック
    return interpolateLinear(grid, scale);
  }

  const sorted = [...grid].sort((a, b) => a.scale - b.scale);
  const minScale = sorted[0].scale;
  const maxScale = sorted[sorted.length - 1].scale;
  const clampedScale = Math.max(minScale, Math.min(maxScale, scale));

  // Find segment index
  let segIdx = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].scale <= clampedScale && sorted[i + 1].scale >= clampedScale) {
      segIdx = i;
      break;
    }
  }

  // Get 4 control points (p0, p1, p2, p3) with boundary clamping
  const p0 = sorted[Math.max(0, segIdx - 1)];
  const p1 = sorted[segIdx];
  const p2 = sorted[Math.min(sorted.length - 1, segIdx + 1)];
  const p3 = sorted[Math.min(sorted.length - 1, segIdx + 2)];

  const range = p2.scale - p1.scale;
  const t = range > 0 ? (clampedScale - p1.scale) / range : 0;

  // Catmull-Rom coefficient matrix (tension = 0.5)
  const t2 = t * t;
  const t3 = t2 * t;

  function catmullRom(v0: number, v1: number, v2: number, v3: number): number {
    return 0.5 * (
      (2 * v1) +
      (-v0 + v2) * t +
      (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
      (-v0 + 3 * v1 - 3 * v2 + v3) * t3
    );
  }

  const damage = catmullRom(
    p0.predicted_damage,
    p1.predicted_damage,
    p2.predicted_damage,
    p3.predicted_damage
  );
  const repair = catmullRom(
    p0.repair_rate,
    p1.repair_rate,
    p2.repair_rate,
    p3.repair_rate
  );
  const dCrit = catmullRom(p0.d_crit, p1.d_crit, p2.d_crit, p3.d_crit);

  const clampedDamage = Math.max(0, Math.min(100, damage));
  const ratio = clampedDamage / Math.max(dCrit, 0.01);

  let status: InterpolatedResult["status"];
  if (ratio >= 1.0) status = "RED";
  else if (ratio >= 0.8) status = "ORANGE";
  else if (ratio >= 0.5) status = "YELLOW";
  else status = "GREEN";

  return {
    predicted_damage: Math.round(clampedDamage * 10) / 10,
    repair_rate: Math.round(Math.max(0, repair) * 100) / 100,
    status,
    is_estimated: true,
  };
}
