/**
 * PACE Platform — NLG エビデンステキストエンジン バレルエクスポート
 */
export {
  generateEvidenceTemplate,
  generateAlertCards,
  determineRiskLevel,
} from "./template-generator";
export { shapeWithGemini, type ShapeResult } from "./gemini-shaper";
export type {
  EvidenceAlert,
  NLGResult,
  AlertCard,
  AlertCardAction,
  AlertRiskLevel,
  MorningAgendaResponse,
  MorningAgendaErrorResponse,
  ApprovalRequest,
  ApprovalResponse,
} from "./types";
