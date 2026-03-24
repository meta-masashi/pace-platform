/**
 * PACE Platform — リハビリメニュー自動生成
 *
 * ベイズ推論結果 + CV キネマティクスデータを LLM Context Injection して
 * 個別化されたリハビリメニューを生成する。
 *
 * 出力JSON構造:
 *   RehabMenu → phases[] → exercises[]
 */

import { callGeminiWithRetry, buildCdsSystemPrefix, MEDICAL_DISCLAIMER, type GeminiCallContext } from "./client";
import { buildInjectedContext, type BayesianDiagnosisResult, type CvKinematicsData, type AthleteProfile } from "./context-injector";
import { cleanJsonResponse } from "../shared/security-helpers";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface RehabExercise {
  id: string;
  name: string;
  description: string;
  sets: number;
  reps: string;           // "10-15" または "30秒" など
  rest_seconds: number;
  tags: string[];
  contraindications: string[];
  progression_notes: string;
  pain_vas_limit: number; // この VAS 値を超えたら中止
}

export interface RehabPhase {
  phase: "acute" | "recovery" | "functional" | "return_to_sport";
  phase_label: string;
  duration_days_min: number;
  duration_days_max: number;
  goals: string[];
  exercises: RehabExercise[];
  progression_criteria: string[];
  red_flags: string[];
}

export interface RehabMenu {
  athlete_id: string;
  session_id: string;
  generated_at: string;
  primary_diagnosis_hint: string;
  risk_level: string;
  phases: RehabPhase[];
  general_precautions: string[];
  follow_up_recommendation: string;
  disclaimer: string;
}

export interface GenerateRehabMenuInput {
  profile: AthleteProfile;
  bayes: BayesianDiagnosisResult;
  cv: CvKinematicsData | null;
  sessionId: string;
  staffContext: GeminiCallContext;
}

// ---------------------------------------------------------------------------
// メイン生成関数
// ---------------------------------------------------------------------------

/**
 * LLM Context Injection を用いてリハビリメニューを生成する。
 *
 * @throws Error("GUARDRAIL_VIOLATION") — ガードレール違反
 * @throws Error("GEMINI_EXHAUSTED") — 全リトライ失敗
 * @throws Error("RATE_LIMIT_EXCEEDED") — レートリミット超過
 */
export async function generateRehabMenu(
  input: GenerateRehabMenuInput
): Promise<RehabMenu> {
  const { profile, bayes, cv, sessionId, staffContext } = input;

  // ハードロック中は生成不可
  if (bayes.hardLockActive) {
    throw new Error(
      "HARD_LOCK_ACTIVE: Hard Lock が有効です。医師の承認後に解除してください。"
    );
  }

  // コンテキスト注入
  const { systemPrompt } = buildInjectedContext(profile, bayes, cv, "rehab");

  // 出力スキーマを指定したプロンプト
  const outputSchema = `
=== 出力JSON形式（厳守）===
{
  "primary_diagnosis_hint": "推定される主傷害名（断言ではなく候補として）",
  "risk_level": "critical|high|medium|low",
  "phases": [
    {
      "phase": "acute|recovery|functional|return_to_sport",
      "phase_label": "フェーズ名（日本語）",
      "duration_days_min": <数値>,
      "duration_days_max": <数値>,
      "goals": ["目標1", "目標2"],
      "exercises": [
        {
          "id": "ex_001",
          "name": "エクササイズ名",
          "description": "実施方法の説明",
          "sets": <数値>,
          "reps": "10-15",
          "rest_seconds": <数値>,
          "tags": ["タグ1"],
          "contraindications": ["禁忌条件"],
          "progression_notes": "進展基準",
          "pain_vas_limit": <0-10の数値>
        }
      ],
      "progression_criteria": ["進展基準1"],
      "red_flags": ["中止基準1"]
    }
  ],
  "general_precautions": ["注意事項1"],
  "follow_up_recommendation": "フォローアップ推奨事項"
}`;

  const fullPrompt = `${systemPrompt}\n${outputSchema}\n\n上記の選手データに基づき、リハビリメニューを生成してください。`;

  const { result } = await callGeminiWithRetry(
    fullPrompt,
    (text) => {
      const parsed = JSON.parse(cleanJsonResponse(text)) as Omit<RehabMenu, "athlete_id" | "session_id" | "generated_at" | "disclaimer">;

      // 禁忌タグに含まれる運動が生成されていないか検証
      validateNoContraindicatedExercises(parsed, bayes.contraindicationTags);

      return parsed;
    },
    staffContext
  );

  return {
    athlete_id: profile.id,
    session_id: sessionId,
    generated_at: new Date().toISOString(),
    disclaimer: MEDICAL_DISCLAIMER,
    ...result,
  };
}

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

/**
 * 生成されたメニューに禁忌タグの運動が含まれていないかチェックする。
 * 含まれていた場合は GUARDRAIL_VIOLATION として例外をスローする。
 */
function validateNoContraindicatedExercises(
  menu: Partial<RehabMenu>,
  contraindicationTags: string[]
): void {
  if (!contraindicationTags.length || !menu.phases) return;

  for (const phase of menu.phases) {
    for (const exercise of phase.exercises ?? []) {
      for (const tag of exercise.tags ?? []) {
        if (contraindicationTags.some((ct) => tag.toLowerCase().includes(ct.toLowerCase()))) {
          console.error(
            `[rehab-generator] 禁忌タグ違反: exercise="${exercise.name}" tag="${tag}"`
          );
          throw new Error(
            `GUARDRAIL_VIOLATION: 禁忌タグ "${tag}" を含む運動 "${exercise.name}" が生成されました`
          );
        }
      }
    }
  }
}
