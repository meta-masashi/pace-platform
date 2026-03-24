/**
 * PACE Platform — SOAPノート補助入力（下書き生成）
 *
 * ベイズ推論結果と CV データをコンテキストに注入し、
 * AT/PT のための SOAP ノート下書きを生成する。
 *
 * 重要:
 *   - 生成結果はあくまで「下書き」であり、スタッフが必ず確認・修正する
 *   - 医療診断の断言は出力ガードレールで排除される
 */

import { callGeminiWithRetry, MEDICAL_DISCLAIMER, type GeminiCallContext } from "./client";
import { buildInjectedContext, type BayesianDiagnosisResult, type CvKinematicsData, type AthleteProfile } from "./context-injector";
import { cleanJsonResponse, sanitizeUserInput } from "../shared/security-helpers";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface SoapDraftInput {
  profile: AthleteProfile;
  bayes: BayesianDiagnosisResult;
  cv: CvKinematicsData | null;
  /** スタッフが入力した主訴・観察メモ（サニタイズ済みでなくてもよい）*/
  staffNotes: string;
  /** 選手が申告した症状・NRS スコア */
  athleteSubjective?: {
    chiefComplaint: string;
    nrsScore: number;
    symptomsDescription: string;
  };
  sessionId: string;
  staffContext: GeminiCallContext;
}

export interface SoapNote {
  S: {
    chief_complaint: string;
    nrs_score: number | null;
    athlete_description: string;
    symptom_onset: string;
    aggravating_factors: string[];
    relieving_factors: string[];
  };
  O: {
    vital_signs_note: string;
    observation: string;
    special_tests: Array<{
      test_name: string;
      result: string;
      interpretation: string;
    }>;
    kinematics_summary: string;
  };
  A: {
    /** 断言ではなく「候補」として記述される */
    primary_hypothesis: string;
    differential_diagnoses: string[];
    risk_level: string;
    contributing_factors: string[];
  };
  P: {
    immediate_management: string[];
    rehab_direction: string;
    referral_consideration: string;
    follow_up_timeframe: string;
    restrictions: string[];
  };
  metadata: {
    session_id: string;
    athlete_id: string;
    generated_at: string;
    is_draft: true;
    disclaimer: string;
  };
}

// ---------------------------------------------------------------------------
// メイン生成関数
// ---------------------------------------------------------------------------

/**
 * SOAPノート下書きを生成する。
 *
 * @throws Error("GEMINI_EXHAUSTED") — 全リトライ失敗
 * @throws Error("RATE_LIMIT_EXCEEDED") — レートリミット超過
 */
export async function generateSoapDraft(input: SoapDraftInput): Promise<SoapNote> {
  const { profile, bayes, cv, staffNotes, athleteSubjective, sessionId, staffContext } = input;

  // スタッフノートのサニタイズ（プロンプトインジェクション対策）
  const sanitizedNotes = sanitizeUserInput(staffNotes);
  const sanitizedSubjective = athleteSubjective
    ? sanitizeUserInput(athleteSubjective.symptomsDescription)
    : null;

  // コンテキスト注入
  const { systemPrompt } = buildInjectedContext(profile, bayes, cv, "soap");

  const outputSchema = `
=== 出力JSON形式（厳守）===
{
  "S": {
    "chief_complaint": "主訴（選手の言葉をそのまま反映）",
    "nrs_score": <0-10の数値またはnull>,
    "athlete_description": "選手の症状説明",
    "symptom_onset": "発症経緯",
    "aggravating_factors": ["悪化因子1"],
    "relieving_factors": ["緩和因子1"]
  },
  "O": {
    "vital_signs_note": "バイタル所見（利用可能な場合）",
    "observation": "視診・触診所見",
    "special_tests": [
      {"test_name": "テスト名", "result": "陽性/陰性/疑陽性", "interpretation": "解釈"}
    ],
    "kinematics_summary": "キネマティクス測定値の要約"
  },
  "A": {
    "primary_hypothesis": "主要な傷害候補（断言ではなく可能性として）",
    "differential_diagnoses": ["鑑別診断1"],
    "risk_level": "critical|high|medium|low",
    "contributing_factors": ["寄与因子1"]
  },
  "P": {
    "immediate_management": ["即時管理1"],
    "rehab_direction": "リハビリ方向性",
    "referral_consideration": "専門家紹介の検討事項",
    "follow_up_timeframe": "フォローアップ時期",
    "restrictions": ["制限事項1"]
  }
}`;

  const staffNotesSection = `
=== スタッフメモ ===
${sanitizedNotes}
${athleteSubjective ? `
=== 選手主訴 ===
- NRS: ${athleteSubjective.nrsScore}/10
- 主訴: ${athleteSubjective.chiefComplaint}
- 詳細: ${sanitizedSubjective}` : ""}`;

  const fullPrompt = `${systemPrompt}\n${staffNotesSection}\n${outputSchema}\n\nSOAPノート下書きを生成してください。`;

  const { result } = await callGeminiWithRetry(
    fullPrompt,
    (text) => JSON.parse(cleanJsonResponse(text)) as Omit<SoapNote, "metadata">,
    staffContext
  );

  return {
    ...result,
    metadata: {
      session_id: sessionId,
      athlete_id: profile.id,
      generated_at: new Date().toISOString(),
      is_draft: true,
      disclaimer: MEDICAL_DISCLAIMER,
    },
  };
}
