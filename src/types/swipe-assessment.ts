/** Bio-Swipe アセスメント: 型定義 */

export interface SwipeResponsePayload {
  athlete_id: string;
  question_id: string;
  response: -1 | 1; // -1: 左スワイプ(良好), 1: 右スワイプ(不良)

  // 心理的テレメトリーデータ（嘘検知用）
  reaction_latency_ms: number; // view_start → swipe_release
  hesitation_time_ms: number; // first_touch → swipe_release
  swipe_velocity: number; // px/s at release
}

export interface SwipeQuestion {
  id: string;
  text: string;
  body_part?: string;
  category: "pain" | "fatigue" | "mobility" | "sleep" | "mental";
}

export interface SwipeTelemetry {
  view_start_time: number;
  first_touch_time: number | null;
  swipe_release_time: number | null;
  swipe_velocity: number;
}

/** コーチ向けトリアージカード */
export interface TriageSwipeCard {
  athlete_id: string;
  athlete_name: string;
  position: string | null;
  status: "RED" | "ORANGE";
  readiness_score: number;
  recommendation: string;
  evidence_text: string;
  risk_score: number;
  /** MRF 波及テキスト（Phase 2 以降、MVP では空文字） */
  propagation_text: string;
}
