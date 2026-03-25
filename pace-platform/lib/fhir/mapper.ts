/**
 * PACE Platform — FHIR データマッパー
 *
 * PACE のドメインデータを HL7 FHIR R4 リソースにマッピングする。
 * LOINC コードは該当するものを使用し、PACE 独自メトリクスには
 * カスタムシステム URI を使用する。
 *
 * @see https://loinc.org/
 * @see https://hl7.org/fhir/R4/
 */

import type {
  FHIRBundle,
  FHIRCarePlan,
  FHIRCondition,
  FHIREntry,
  FHIRObservation,
  FHIRPatient,
  FHIRActivity,
} from './types';

// ---------------------------------------------------------------------------
// 定数 — コーディングシステム URI
// ---------------------------------------------------------------------------

/** LOINC コーディングシステム URI */
const LOINC_SYSTEM = 'http://loinc.org';

/** SNOMED CT コーディングシステム URI */
const SNOMED_SYSTEM = 'http://snomed.info/sct';

/** PACE 独自コーディングシステム URI */
const PACE_SYSTEM = 'https://pace-platform.io/fhir/CodeSystem/pace-metrics';

/** FHIR Observation カテゴリ URI */
const OBSERVATION_CATEGORY_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/observation-category';

/** FHIR Condition Clinical Status URI */
const CONDITION_CLINICAL_STATUS_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/condition-clinical';

// ---------------------------------------------------------------------------
// 入力データ型（Supabase のテーブル行に対応）
// ---------------------------------------------------------------------------

/** 選手データ */
export interface AthleteRow {
  id: string;
  name: string;
  birth_date?: string;
  gender?: string;
}

/** 日次メトリクスデータ */
export interface DailyMetricRow {
  id: string;
  athlete_id: string;
  recorded_date: string;
  conditioning_score?: number;
  acwr?: number;
  hrv_rmssd?: number;
  nrs_pain?: number;
}

/** アセスメント結果データ */
export interface AssessmentResultRow {
  id: string;
  node_id: string;
  node_name: string;
  posterior_probability: number;
  evidence_summary?: string;
  created_at?: string;
}

/** リハビリプログラムデータ */
export interface RehabProgramRow {
  id: string;
  diagnosis_code: string;
  current_phase: number;
  status: string;
  start_date: string;
  estimated_rtp_date?: string;
}

// ---------------------------------------------------------------------------
// マッピング関数
// ---------------------------------------------------------------------------

/**
 * 選手データを FHIR Patient リソースにマッピングする
 *
 * @param athlete - 選手データ
 * @returns FHIR Patient リソース
 */
export function mapAthleteToPatient(athlete: AthleteRow): FHIRPatient {
  // 日本語名を姓・名に分割（スペース区切り）
  const nameParts = (athlete.name ?? '').split(/\s+/);
  const family = nameParts[0] ?? '';
  const given = nameParts.slice(1);

  const patient: FHIRPatient = {
    resourceType: 'Patient',
    id: athlete.id,
    name: [{ family, given: given.length > 0 ? given : [family] }],
  };

  if (athlete.birth_date) {
    patient.birthDate = athlete.birth_date;
  }

  if (athlete.gender) {
    const genderMap: Record<string, FHIRPatient['gender']> = {
      male: 'male',
      female: 'female',
      M: 'male',
      F: 'female',
      男: 'male',
      女: 'female',
    };
    patient.gender = genderMap[athlete.gender] ?? 'unknown';
  }

  return patient;
}

/**
 * 日次メトリクスを FHIR Observation リソース群にマッピングする
 *
 * - conditioning_score → PACE 独自コード
 * - acwr → PACE 独自コード
 * - hrv_rmssd → LOINC 80404-7 (Heart rate variability RMSSD)
 * - nrs_pain → LOINC 72514-3 (Pain severity NRS)
 *
 * @param metrics - メトリクスデータ一覧
 * @param athleteId - 選手 ID
 * @returns FHIR Observation リソース群
 */
export function mapMetricsToObservations(
  metrics: DailyMetricRow[],
  athleteId: string
): FHIRObservation[] {
  const observations: FHIRObservation[] = [];
  const subjectRef = { reference: `Patient/${athleteId}` };
  const vitalSignsCategory = [
    {
      coding: [
        {
          system: OBSERVATION_CATEGORY_SYSTEM,
          code: 'vital-signs',
          display: 'Vital Signs',
        },
      ],
    },
  ];

  for (const m of metrics) {
    const dateTime = m.recorded_date.includes('T')
      ? m.recorded_date
      : `${m.recorded_date}T00:00:00Z`;

    // コンディショニングスコア
    if (m.conditioning_score != null) {
      observations.push({
        resourceType: 'Observation',
        id: `${m.id}-conditioning`,
        status: 'final',
        category: vitalSignsCategory,
        code: {
          coding: [
            {
              system: PACE_SYSTEM,
              code: 'conditioning-score',
              display: 'Conditioning Score',
            },
          ],
          text: 'コンディショニングスコア',
        },
        valueQuantity: {
          value: m.conditioning_score,
          unit: 'score',
          system: PACE_SYSTEM,
          code: 'score',
        },
        effectiveDateTime: dateTime,
        subject: subjectRef,
      });
    }

    // ACWR
    if (m.acwr != null) {
      observations.push({
        resourceType: 'Observation',
        id: `${m.id}-acwr`,
        status: 'final',
        category: vitalSignsCategory,
        code: {
          coding: [
            {
              system: PACE_SYSTEM,
              code: 'acwr',
              display: 'Acute:Chronic Workload Ratio',
            },
          ],
          text: 'ACWR（急性：慢性ワークロード比）',
        },
        valueQuantity: {
          value: m.acwr,
          unit: 'ratio',
          system: PACE_SYSTEM,
          code: 'ratio',
        },
        effectiveDateTime: dateTime,
        subject: subjectRef,
      });
    }

    // HRV RMSSD — LOINC 80404-7
    if (m.hrv_rmssd != null) {
      observations.push({
        resourceType: 'Observation',
        id: `${m.id}-hrv`,
        status: 'final',
        category: vitalSignsCategory,
        code: {
          coding: [
            {
              system: LOINC_SYSTEM,
              code: '80404-7',
              display: 'R-R interval.standard deviation (Heart rate variability)',
            },
          ],
          text: 'HRV RMSSD',
        },
        valueQuantity: {
          value: m.hrv_rmssd,
          unit: 'ms',
          system: 'http://unitsofmeasure.org',
          code: 'ms',
        },
        effectiveDateTime: dateTime,
        subject: subjectRef,
      });
    }

    // NRS Pain — LOINC 72514-3
    if (m.nrs_pain != null) {
      observations.push({
        resourceType: 'Observation',
        id: `${m.id}-nrs`,
        status: 'final',
        category: vitalSignsCategory,
        code: {
          coding: [
            {
              system: LOINC_SYSTEM,
              code: '72514-3',
              display: 'Pain severity - 0-10 verbal numeric rating [Score] - Reported',
            },
          ],
          text: 'NRS 疼痛スケール',
        },
        valueQuantity: {
          value: m.nrs_pain,
          unit: 'score',
          system: 'http://unitsofmeasure.org',
          code: '{score}',
        },
        effectiveDateTime: dateTime,
        subject: subjectRef,
      });
    }
  }

  return observations;
}

/**
 * アセスメント結果を FHIR Condition リソースにマッピングする
 *
 * ベイジアンネットワークによる傷害リスク評価を FHIR Condition として表現する。
 *
 * @param result - アセスメント結果
 * @param athleteId - 選手 ID
 * @returns FHIR Condition リソース
 */
export function mapAssessmentToCondition(
  result: AssessmentResultRow,
  athleteId: string
): FHIRCondition {
  // リスクレベルに基づいた臨床ステータス
  const clinicalCode =
    result.posterior_probability >= 0.7 ? 'active' : 'inactive';

  const condition: FHIRCondition = {
    resourceType: 'Condition',
    id: result.id,
    clinicalStatus: {
      coding: [
        {
          system: CONDITION_CLINICAL_STATUS_SYSTEM,
          code: clinicalCode,
          display: clinicalCode === 'active' ? 'Active' : 'Inactive',
        },
      ],
    },
    code: {
      coding: [
        {
          system: PACE_SYSTEM,
          code: result.node_id,
          display: result.node_name,
        },
      ],
      text: `${result.node_name}（リスク確率: ${(result.posterior_probability * 100).toFixed(1)}%）`,
    },
    subject: { reference: `Patient/${athleteId}` },
  };

  if (result.created_at) {
    condition.onsetDateTime = result.created_at;
  }

  return condition;
}

/**
 * リハビリプログラムを FHIR CarePlan リソースにマッピングする
 *
 * @param program - リハビリプログラムデータ
 * @param athleteId - 選手 ID
 * @returns FHIR CarePlan リソース
 */
export function mapRehabToCarePlan(
  program: RehabProgramRow,
  athleteId: string
): FHIRCarePlan {
  // ステータスマッピング
  const statusMap: Record<string, FHIRCarePlan['status']> = {
    active: 'active',
    completed: 'completed',
    on_hold: 'on-hold',
  };

  const activities: FHIRActivity[] = [
    {
      detail: {
        description: `フェーズ ${program.current_phase} / 4 — 診断コード: ${program.diagnosis_code}`,
        status: program.status === 'active' ? 'in-progress' : program.status,
      },
    },
  ];

  const carePlan: FHIRCarePlan = {
    resourceType: 'CarePlan',
    id: program.id,
    status: statusMap[program.status] ?? 'active',
    intent: 'plan',
    title: `リハビリプログラム — ${program.diagnosis_code}`,
    period: {
      start: program.start_date,
      end: program.estimated_rtp_date ?? undefined,
    },
    activity: activities,
    subject: { reference: `Patient/${athleteId}` },
  };

  return carePlan;
}

/**
 * 全リソースを FHIR Bundle にまとめる
 *
 * @param patient - Patient リソース
 * @param observations - Observation リソース群
 * @param conditions - Condition リソース群
 * @param carePlans - CarePlan リソース群
 * @returns FHIR Bundle
 */
export function buildFHIRBundle(
  patient: FHIRPatient,
  observations: FHIRObservation[],
  conditions: FHIRCondition[],
  carePlans: FHIRCarePlan[]
): FHIRBundle {
  const entries: FHIREntry[] = [];

  // Patient
  entries.push({
    fullUrl: `urn:uuid:${patient.id}`,
    resource: patient,
  });

  // Observations
  for (const obs of observations) {
    entries.push({
      fullUrl: `urn:uuid:${obs.id}`,
      resource: obs,
    });
  }

  // Conditions
  for (const cond of conditions) {
    entries.push({
      fullUrl: `urn:uuid:${cond.id}`,
      resource: cond,
    });
  }

  // CarePlans
  for (const plan of carePlans) {
    entries.push({
      fullUrl: `urn:uuid:${plan.id}`,
      resource: plan,
    });
  }

  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    total: entries.length,
    entry: entries,
  };
}
