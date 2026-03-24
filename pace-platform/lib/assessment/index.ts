/**
 * PACE Platform — アセスメントエンジン バレルエクスポート
 *
 * Computerized Adaptive Testing (CAT) によるインジュリーアセスメント。
 */

// 型定義
export type {
  AssessmentType,
  AssessmentStatus,
  AnswerValue,
  RiskLevel,
  AssessmentNode,
  RoutingRules,
  RedFlagCondition,
  SkipCondition,
  AssessmentSession,
  AssessmentResponse,
  PosteriorResult,
  NextQuestionResult,
  RedFlagResult,
  AssessmentResult,
  StartAssessmentResponse,
  AnswerAssessmentResponse,
  AssessmentStatusResponse,
  PosteriorsResponse,
  AssessmentErrorResponse,
} from "./types";

// CAT エンジン
export {
  selectNextQuestion,
  checkRedFlags,
  shouldTerminate,
  buildAssessmentResult,
} from "./cat-engine";

// 事後確率更新
export {
  initializePriors,
  updatePosteriors,
  normalizeWithMutualExclusion,
} from "./posterior-updater";
