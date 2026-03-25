/**
 * PACE v6.0 — アダプター バレル再エクスポート
 *
 * 既存モジュール（conditioning, bayes）のアダプターを一括エクスポートする。
 */

// ---------------------------------------------------------------------------
// コンディショニングアダプター
// ---------------------------------------------------------------------------

export {
  adaptEWMA,
  adaptACWR,
  calculateEWMA,
} from './conditioning-adapter';

export type {
  EWMAResult,
  ACWRResult,
  EWMAConfig,
  ConditioningResult,
  DailyMetricRow,
} from './conditioning-adapter';

// ---------------------------------------------------------------------------
// ベイズアダプター
// ---------------------------------------------------------------------------

export {
  adaptDAGPosterior,
  wilsonScoreInterval,
  calculatePosteriorWithDAG,
  probabilityToOdds,
  oddsToProbability,
} from './bayes-adapter';

export type {
  DAGPosteriorInput,
  DAGPosteriorResult,
  AssessmentNode,
  ActiveObservation,
  CausalEdge,
  RiskLevel,
} from './bayes-adapter';
