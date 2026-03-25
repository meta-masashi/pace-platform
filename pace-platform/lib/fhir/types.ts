/**
 * PACE Platform — HL7 FHIR R4 型定義
 *
 * HL7 FHIR R4 準拠のリソース型を定義する。
 * 選手データのエクスポートに使用する Patient / Observation /
 * Condition / CarePlan リソースを含む。
 *
 * @see https://hl7.org/fhir/R4/
 */

// ---------------------------------------------------------------------------
// 共通型
// ---------------------------------------------------------------------------

/** FHIR Coding 要素 */
export interface FHIRCoding {
  /** コーディングシステム URI */
  system: string;
  /** コード値 */
  code: string;
  /** 表示名 */
  display: string;
}

/** FHIR CodeableConcept 要素 */
export interface FHIRCodeableConcept {
  coding: FHIRCoding[];
  text?: string;
}

/** FHIR Reference 要素 */
export interface FHIRReference {
  reference: string;
  display?: string;
}

/** FHIR Period 要素 */
export interface FHIRPeriod {
  start: string;
  end?: string;
}

/** FHIR HumanName 要素 */
export interface FHIRHumanName {
  family: string;
  given: string[];
}

/** FHIR Quantity 要素 */
export interface FHIRQuantity {
  value: number;
  unit: string;
  system?: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// Patient リソース
// ---------------------------------------------------------------------------

/** FHIR Patient リソース */
export interface FHIRPatient {
  resourceType: 'Patient';
  id: string;
  name: [FHIRHumanName];
  birthDate?: string;
  gender?: 'male' | 'female' | 'other' | 'unknown';
}

// ---------------------------------------------------------------------------
// Observation リソース
// ---------------------------------------------------------------------------

/** FHIR Observation リソース */
export interface FHIRObservation {
  resourceType: 'Observation';
  id: string;
  status: 'final';
  category?: FHIRCodeableConcept[];
  code: FHIRCodeableConcept;
  valueQuantity?: FHIRQuantity;
  effectiveDateTime: string;
  subject: FHIRReference;
}

// ---------------------------------------------------------------------------
// Condition リソース
// ---------------------------------------------------------------------------

/** FHIR Condition リソース */
export interface FHIRCondition {
  resourceType: 'Condition';
  id: string;
  clinicalStatus: FHIRCodeableConcept;
  code: FHIRCodeableConcept;
  subject: FHIRReference;
  onsetDateTime?: string;
}

// ---------------------------------------------------------------------------
// CarePlan リソース
// ---------------------------------------------------------------------------

/** FHIR CarePlan Activity 要素 */
export interface FHIRActivity {
  detail: {
    description: string;
    status: string;
  };
}

/** FHIR CarePlan リソース */
export interface FHIRCarePlan {
  resourceType: 'CarePlan';
  id: string;
  status: 'active' | 'completed' | 'revoked' | 'on-hold';
  intent: 'plan';
  title: string;
  period?: FHIRPeriod;
  activity?: FHIRActivity[];
  subject: FHIRReference;
}

// ---------------------------------------------------------------------------
// Bundle リソース
// ---------------------------------------------------------------------------

/** FHIR Bundle Entry */
export interface FHIREntry {
  fullUrl?: string;
  resource: FHIRPatient | FHIRObservation | FHIRCondition | FHIRCarePlan;
}

/** FHIR Bundle リソース */
export interface FHIRBundle {
  resourceType: 'Bundle';
  type: 'collection';
  timestamp: string;
  total?: number;
  entry: FHIREntry[];
}
