/**
 * PACE Platform — チームトレーニングメニュー生成（S&C向け）
 *
 * チーム全体のコンディションデータを集約し、
 * 週間トレーニングメニューを AI で生成する。
 *
 * 出力:
 *   - 全員向けチームメニュー（週5日分）
 *   - 個別調整が必要な選手リスト（傷害・高負荷）
 */

import { callGeminiWithRetry, buildCdsSystemPrefix, MEDICAL_DISCLAIMER, type GeminiCallContext } from "./client";
import { cleanJsonResponse } from "../shared/security-helpers";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface AthleteConditionSummary {
  athlete_id: string;
  name: string;
  position?: string;
  /** 傷害リスクレベル */
  risk_level: "critical" | "high" | "medium" | "low" | "none";
  acwr?: number;
  hrv_baseline_ratio?: number;
  srpe_last_session?: number;
  hard_lock_active: boolean;
  soft_lock_active: boolean;
  /** 現在の傷害タグ（例: ["knee_load_restricted", "no_contact"]）*/
  restriction_tags: string[];
}

export interface TeamMenuInput {
  teamId: string;
  teamName: string;
  sport: string;
  weekStartDate: string; // ISO 8601
  athletes: AthleteConditionSummary[];
  /** 今週のマクロサイクル段階（例: "taper", "loading", "recovery"）*/
  trainingPeriod: "pre_season" | "in_season" | "post_season" | "off_season";
  /** S&C が手動で追加したセッション制約（例: "試合前日のため高強度禁止"）*/
  sessionConstraints?: string;
  staffContext: GeminiCallContext;
}

export interface TrainingSession {
  day: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  session_type: "strength" | "power" | "endurance" | "recovery" | "speed" | "rest";
  intensity: "low" | "moderate" | "high";
  duration_minutes: number;
  exercises: Array<{
    name: string;
    sets: number;
    reps: string;
    load_note: string;
  }>;
  coaching_notes: string;
}

export interface IndividualAdjustment {
  athlete_id: string;
  athlete_name: string;
  reason: string;
  modifications: string[];
  excluded_exercises: string[];
}

export interface TeamTrainingMenu {
  team_id: string;
  week_start_date: string;
  generated_at: string;
  training_period: string;
  team_sessions: TrainingSession[];
  individual_adjustments: IndividualAdjustment[];
  /** Hard Lock / Soft Lock 選手への注意事項 */
  locked_athletes_notice: string[];
  weekly_load_note: string;
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// メイン生成関数
// ---------------------------------------------------------------------------

/**
 * チーム週間トレーニングメニューを生成する。
 *
 * @throws Error("GEMINI_EXHAUSTED") — 全リトライ失敗
 * @throws Error("RATE_LIMIT_EXCEEDED") — レートリミット超過
 */
export async function generateTeamMenu(input: TeamMenuInput): Promise<TeamTrainingMenu> {
  const {
    teamId,
    teamName,
    sport,
    weekStartDate,
    athletes,
    trainingPeriod,
    sessionConstraints,
    staffContext,
  } = input;

  // チームコンディションサマリーを構築
  const conditionSummary = buildTeamConditionSummary(athletes);

  const systemPrefix = buildCdsSystemPrefix();

  const teamContext = `
=== チーム情報 ===
- チーム名: ${teamName}
- スポーツ: ${sport}
- トレーニング期間: ${trainingPeriod}
- 週開始日: ${weekStartDate}
- 選手数: ${athletes.length}名

=== チームコンディション概要 ===
${conditionSummary}

${sessionConstraints ? `=== S&C セッション制約 ===\n${sessionConstraints}\n` : ""}

=== タスク: 週間チームトレーニングメニュー生成（S&C向け）===
- Hard Lock 選手はトレーニングに一切参加させないこと
- Soft Lock 選手は軽度のリカバリーのみ許可
- ACWR > 1.5 の選手には個別調整を必ず設定すること
- リスクレベル "critical" / "high" の選手は individual_adjustments に含めること`;

  const outputSchema = `
=== 出力JSON形式（厳守）===
{
  "team_sessions": [
    {
      "day": "Monday",
      "session_type": "strength|power|endurance|recovery|speed|rest",
      "intensity": "low|moderate|high",
      "duration_minutes": <数値>,
      "exercises": [
        {"name": "エクサ サイズ名", "sets": <数値>, "reps": "8-10", "load_note": "負荷メモ"}
      ],
      "coaching_notes": "コーチングメモ"
    }
  ],
  "individual_adjustments": [
    {
      "athlete_id": "uuid",
      "athlete_name": "選手名",
      "reason": "調整理由",
      "modifications": ["修正事項1"],
      "excluded_exercises": ["除外エクサ サイズ1"]
    }
  ],
  "locked_athletes_notice": ["ロック選手への注意事項"],
  "weekly_load_note": "週間負荷に関するコーチへのメモ"
}`;

  const fullPrompt = `${systemPrefix}\n${teamContext}\n${outputSchema}\n\n週間チームトレーニングメニューを生成してください。`;

  const { result } = await callGeminiWithRetry(
    fullPrompt,
    (text) =>
      JSON.parse(cleanJsonResponse(text)) as Pick<
        TeamTrainingMenu,
        "team_sessions" | "individual_adjustments" | "locked_athletes_notice" | "weekly_load_note"
      >,
    staffContext
  );

  return {
    team_id: teamId,
    week_start_date: weekStartDate,
    generated_at: new Date().toISOString(),
    training_period: trainingPeriod,
    disclaimer: MEDICAL_DISCLAIMER,
    ...result,
  };
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

export function buildTeamConditionSummary(athletes: AthleteConditionSummary[]): string {
  const lines: string[] = [];

  const hardLocked = athletes.filter((a) => a.hard_lock_active);
  const softLocked = athletes.filter((a) => a.soft_lock_active && !a.hard_lock_active);
  const critical = athletes.filter(
    (a) => a.risk_level === "critical" && !a.hard_lock_active
  );
  const high = athletes.filter(
    (a) => a.risk_level === "high" && !a.hard_lock_active && !a.soft_lock_active
  );
  const overloaded = athletes.filter((a) => (a.acwr ?? 0) > 1.5);

  if (hardLocked.length > 0) {
    lines.push(`[Hard Lock / 完全免荷] ${hardLocked.map((a) => a.name).join(", ")}`);
  }
  if (softLocked.length > 0) {
    lines.push(`[Soft Lock / 軽度のみ] ${softLocked.map((a) => a.name).join(", ")}`);
  }
  if (critical.length > 0) {
    lines.push(`[Critical リスク] ${critical.map((a) => a.name).join(", ")}`);
  }
  if (high.length > 0) {
    lines.push(`[High リスク] ${high.map((a) => a.name).join(", ")}`);
  }
  if (overloaded.length > 0) {
    lines.push(
      `[ACWR過負荷 > 1.5] ${overloaded.map((a) => `${a.name}(ACWR=${a.acwr?.toFixed(2)})`).join(", ")}`
    );
  }

  // 全選手の個別コンディション
  lines.push("\n[全選手コンディション]");
  for (const athlete of athletes) {
    const restrictions =
      athlete.restriction_tags.length > 0
        ? ` | 制限: ${athlete.restriction_tags.join(", ")}`
        : "";
    const acwr = athlete.acwr !== undefined ? ` ACWR=${athlete.acwr.toFixed(2)}` : "";
    const hrv =
      athlete.hrv_baseline_ratio !== undefined
        ? ` HRV=${(athlete.hrv_baseline_ratio * 100).toFixed(0)}%`
        : "";
    lines.push(
      `  - ${athlete.name} [${athlete.risk_level}]${acwr}${hrv}${restrictions}`
    );
  }

  return lines.join("\n");
}
