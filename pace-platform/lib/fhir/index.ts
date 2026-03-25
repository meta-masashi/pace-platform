/**
 * PACE Platform — FHIR モジュール バレルエクスポート
 *
 * HL7 FHIR R4 関連の型定義とマッピング関数を再エクスポートする。
 */

export type {
  FHIRBundle,
  FHIREntry,
  FHIRPatient,
  FHIRObservation,
  FHIRCondition,
  FHIRCarePlan,
  FHIRActivity,
  FHIRCoding,
  FHIRCodeableConcept,
  FHIRReference,
  FHIRPeriod,
  FHIRHumanName,
  FHIRQuantity,
} from './types';

export {
  mapAthleteToPatient,
  mapMetricsToObservations,
  mapAssessmentToCondition,
  mapRehabToCarePlan,
  buildFHIRBundle,
} from './mapper';

export type {
  AthleteRow,
  DailyMetricRow,
  AssessmentResultRow,
  RehabProgramRow,
} from './mapper';
