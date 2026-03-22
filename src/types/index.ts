// ============================================================
// Core Types for PACE Platform
// ============================================================

export type Role = "master" | "AT" | "PT" | "S&C";
export type Priority = "critical" | "watchlist" | "normal";
export type LockType = "hard" | "soft";
export type AssessmentType = "F1_Acute" | "F2_Chronic" | "F3_Performance";
export type RehabPhase = 1 | 2 | 3 | 4;
export type PlanType = "pro" | "standard";

// ---- Multi-tenant ----
export interface Organization {
  id: string;
  name: string;
  plan: PlanType;
  athlete_limit: number;
  created_at: string;
}

export interface Team {
  id: string;
  org_id: string;
  name: string;
}

// ---- Staff ----
export interface Staff {
  id: string;
  org_id: string;
  team_id: string;
  name: string;
  email: string;
  role: Role;
  is_leader: boolean;
  is_active: boolean;
  avatar_url?: string;
}

// ---- Athletes ----
export type Sex = "male" | "female";

export interface Athlete {
  id: string;
  org_id: string;
  team_id: string;
  name: string;
  position: string;
  number: number;
  age: number;
  sex: Sex;
  profile_photo?: string;
  // computed / latest
  status: Priority;
  hp: number;         // 0-100 composite health score
  nrs: number;        // 0-10 pain
  hrv: number;        // ms
  acwr: number;       // ratio
  last_updated: string;
}

// ---- Daily metrics ----
export interface DailyMetric {
  id: string;
  athlete_id: string;
  date: string;
  nrs: number;
  hrv: number;
  acwr: number;
  sleep_score: number;
  subjective_condition: number; // 1-5
  hp_computed: number;
}

// ---- Assessment ----
export interface AssessmentNode {
  node_id: string;
  file_type: AssessmentType;
  phase: string;
  category: string;
  question_text: string;
  target_axis: string;
  lr_yes: number;
  lr_no: number;
  kappa: number;
  routing_rules: string[];
  prescription_tags: string[];
  contraindication_tags: string[];
  time_decay_lambda: number;
  information_gain?: number; // computed at runtime
}

export interface AlphaChain {
  chain_id: string;
  chain_name: string;
  nodes: Array<{ node_id: string; alpha: number }>;
  causal_reasoning: string;
  cross_axis_indicators: string[];
}

export type AnswerValue = "yes" | "no" | "unclear";

export interface AssessmentResponse {
  node_id: string;
  answer: AnswerValue;
  timestamp: string;
}

export interface DiagnosisResult {
  diagnosis_code: string;
  label: string;
  probability: number;
  prescriptionTags?: string[];
  contraindicationTags?: string[];
}

// ---- Multi-axis assessment summary (replaces Bayesian body-part classification) ----

export type RiskLevel = "green" | "yellow" | "red";

export interface AxisFinding {
  axis: string;
  nodeId: string;
  question: string;
  answer: "yes" | "no";
  isSignificant: boolean;
  prescriptionTags: string[];
  contraindicationTags: string[];
}

export interface AssessmentSummary {
  riskLevel: RiskLevel;
  hasRedFlag: boolean;
  hasAcuteInjury: boolean;
  positiveFindings: AxisFinding[];
  allPrescriptionTags: string[];
  allContraindicationTags: string[];
  confidenceScore: number;
  nodesAnswered: number;
  interpretation: string;
}

export interface Assessment {
  id: string;
  athlete_id: string;
  staff_id: string;
  assessment_type: AssessmentType;
  status: "in_progress" | "completed" | "cancelled";
  responses: AssessmentResponse[];
  primary_diagnosis?: DiagnosisResult;
  differentials: DiagnosisResult[];
  started_at: string;
  completed_at?: string;
}

// ---- Locks ----
export interface AthleteLock {
  id: string;
  athlete_id: string;
  set_by_staff_id: string;
  lock_type: LockType;
  tag: string;          // e.g. "ankle_impact", "bilateral_jump"
  reason: string;
  set_at: string;
  expires_at?: string;
}

// ---- Rehabilitation ----
export interface RehabProgram {
  id: string;
  athlete_id: string;
  diagnosis_code: string;
  diagnosis_label: string;
  current_phase: RehabPhase;
  start_date: string;
  estimated_rtp_date: string;
  status: "active" | "completed" | "on_hold";
  // measurements
  rom?: number;
  swelling_grade?: number;
  lsi_percent?: number;
}

export interface RehabGate {
  id: string;
  program_id: string;
  phase: RehabPhase;
  gate_criteria: Record<string, string | number>;
  gate_met_at?: string;
  verified_by_staff_id?: string;
}

// ---- Exercises ----
export interface Exercise {
  id: string;
  category: string;
  phase: RehabPhase | "rehab";
  name_en: string;
  name_ja: string;
  target_axis: string;
  sets: number;
  reps?: number;
  time_sec?: number;
  percent_1rm?: number;
  rpe?: number;
  cues: string;
  progressions: string;
  contraindication_tags: string[];
}

// ---- Workout (AI generated menu) ----
export interface WorkoutItem {
  exercise_id: string;
  exercise_name: string;
  sets: number;
  reps_or_time: string;
  unit: "reps" | "sec" | "min";
  rpe?: number;
  cues?: string;
  reason: string;
  block?: string; // training block label e.g. "ウォームアップ", "ストレングス"
}

export interface Workout {
  id: string;
  athlete_id?: string;
  team_id?: string;
  type: "individual" | "team";
  generated_by_ai: boolean;
  generated_at: string;
  approved_by_staff_id?: string;
  approved_at?: string;
  distributed_at?: string;
  menu: WorkoutItem[];
  total_duration_min: number;
  notes?: string;
}

// ---- SOAP Notes ----
export interface SoapNote {
  id: string;
  athlete_id: string;
  staff_id: string;
  s_text: string;
  o_text: string;
  a_text: string;
  p_text: string;
  created_at: string;
  ai_assisted: boolean;
}

// ---- Triage ----
export type TriggerType =
  | "nrs_spike"
  | "hrv_drop"
  | "acwr_exceeded"
  | "subjective_objective_discrepancy"
  | "baseline_deviation";

/** Computed triage entry (runtime, not persisted as-is) */
export interface TriageEntry {
  athlete_id: string;
  athlete_name: string;
  position: string;
  priority: Priority;
  triggers: TriggerType[];
  nrs: number;
  hrv: number;
  acwr: number;
  pace_inference_label?: string;
  pace_inference_confidence?: number;
  last_updated: string;
}

/** DB triage テーブルの永続化レコード */
export type TriageTriggerType =
  | "nrs_spike"
  | "hrv_drop"
  | "acwr_excess"
  | "subjective_objective_divergence";

export type TriageSeverity = "critical" | "watchlist";

export interface TriageRecord {
  id: string;
  athlete_id: string;
  org_id: string;
  trigger_type: TriageTriggerType;
  severity: TriageSeverity;
  metric_value: number;
  threshold_value: number;
  created_at: string;
  resolved_at?: string | null;
  resolved_by_staff_id?: string | null;
}

// ---- Community ----
export interface Channel {
  id: string;
  team_id: string;
  name: string;
  member_count: number;
}

// ---- CDS Audit Trail ----
export type AuditActionType =
  | "assessment_completed"
  | "menu_approved"
  | "soap_saved"
  | "lock_issued"
  | "escalation_sent"
  | "differential_viewed";

export interface AuditLog {
  id: string;
  timestamp: string;
  staff_id: string;
  staff_name: string;
  staff_role: Role;
  action_type: AuditActionType;
  athlete_id?: string;
  athlete_name?: string;
  ai_assisted: boolean;
  disclaimer_shown: boolean;
  cds_version: string;
  session_id?: string;
  notes?: string;
}

// ---- Escalation ----
export type EscalationSeverity = "urgent" | "high" | "routine";

export interface EscalationRecord {
  id: string;
  created_at: string;
  from_staff_id: string;
  from_staff_name: string;
  from_role: Role;
  to_roles: Role[];
  athlete_id: string;
  athlete_name: string;
  severity: EscalationSeverity;
  message: string;
  audit_log_id: string;
  acknowledged_at?: string;
  acknowledged_by_name?: string;
}

export interface MessageReadReceipt {
  staff_id: string;
  staff_name: string;
  read_at: string;
}

export interface Message {
  id: string;
  channel_id: string;
  staff: Staff;
  content: string;
  created_at: string;
  linked_soap_id?: string;
  cds_disclaimer?: boolean;
  read_by?: MessageReadReceipt[];
}

// ---- RTP Injury Node ----
export interface RTPInjuryNode {
  node_id: string;
  injury_type: string;
  phase: RehabPhase;
  gate_criteria: Record<string, string | number>;
  lsi_target: number;
  test_battery: string[];
}

// ---- Schedule ----
export type EventType = "practice" | "match" | "recovery" | "meeting" | "off";

export interface ScheduleEvent {
  id: string;
  team_id: string;
  title: string;
  event_type: EventType;
  date: string;
  start_time: string;
  end_time: string;
  location?: string;
  opponent?: string;
  notes?: string;
  workout_id?: string;
  created_by_staff_id: string;
  estimated_rpe?: number;
  estimated_duration_min?: number;
}

export type AttendanceStatus = "present" | "absent" | "late" | "injured_out";

export interface AttendanceRecord {
  id: string;
  event_id: string;
  athlete_id: string;
  athlete_name: string;
  status: AttendanceStatus;
  rpe_reported?: number;
  notes?: string;
}
