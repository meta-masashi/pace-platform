/**
 * PACE Platform — SOAP ノート AI 生成 API
 *
 * POST /api/soap/generate
 *
 * アスリートの最新データに基づき、Gemini AI で
 * SOAPノートの下書きを生成する。
 *
 * セキュリティ:
 *   - 防壁2: セキュリティヘルパー（入力サニタイズ・出力ガードレール）
 *   - 防壁3: レートリミッター（毎分・日次上限）
 *   - 生成結果は「下書き」として返却（スタッフが確認・編集後に保存）
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiHandler, ApiError } from "@/lib/api/handler";
import { requireAccess } from "@/lib/billing/plan-gates";
import {
  checkRateLimit,
  buildRateLimitResponse,
  logTokenUsage,
} from "@/lib/gemini/rate-limiter";
import {
  callGeminiWithRetry,
  buildCdsSystemPrefix,
  MEDICAL_DISCLAIMER,
} from "@/lib/gemini/client";
import { sanitizeUserInput, cleanJsonResponse } from "@/lib/shared/security-helpers";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface GenerateRequestBody {
  athleteId: string;
  assessmentId?: string;
}

interface GeneratedSoapContent {
  sText: string;
  oText: string;
  aText: string;
  pText: string;
}

// ---------------------------------------------------------------------------
// POST /api/soap/generate
// ---------------------------------------------------------------------------

export const POST = withApiHandler(async (req, ctx) => {
  // ----- 認証チェック -----
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。ログインしてください。");
  }

  // ----- レートリミットチェック（防壁3）-----
  const rateLimitResult = await checkRateLimit(user.id, "soap-generate");
  if (!rateLimitResult.allowed) {
    const { body, retryAfterSeconds } = buildRateLimitResponse(rateLimitResult);
    return NextResponse.json(body, {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    });
  }

  // ----- リクエストボディパース -----
  let body: GenerateRequestBody;
  try {
    body = (await req.json()) as GenerateRequestBody;
  } catch {
    throw new ApiError(400, "リクエストボディのJSONパースに失敗しました。");
  }

  if (!body.athleteId || typeof body.athleteId !== "string") {
    throw new ApiError(400, "athleteId が必要です。");
  }

  // ----- アスリート情報取得 -----
  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("id, name, age, sex, position, sport, org_id")
    .eq("id", body.athleteId)
    .single();

  if (athleteError || !athlete) {
    throw new ApiError(403, "指定されたアスリートが見つからないか、アクセス権がありません。");
  }

  // ----- プラン別機能ゲート（Pro+ 必須）-----
  try {
    await requireAccess(supabase, athlete.org_id, 'feature_gemini_ai');
  } catch (gateErr) {
    throw new ApiError(403, gateErr instanceof Error ? gateErr.message : 'この機能はご利用いただけません。');
  }

  // ----- 最新の daily_metrics 取得（直近 7 日）-----
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: metrics } = await supabase
    .from("daily_metrics")
    .select(
      "date, nrs, rpe, srpe, sleep_score, subjective_condition, fatigue_subjective, conditioning_score, acwr"
    )
    .eq("athlete_id", body.athleteId)
    .gte("date", sevenDaysAgo.toISOString().split("T")[0]!)
    .order("date", { ascending: false })
    .limit(7);

  // ----- アセスメント結果取得（指定がある場合）-----
  let assessmentData: Record<string, unknown> | null = null;
  if (body.assessmentId) {
    const { data: result } = await supabase
      .from("assessment_results")
      .select("primary_diagnosis, confidence, differentials, red_flags, contraindication_tags, prescription_tags")
      .eq("session_id", body.assessmentId)
      .single();

    if (result) {
      assessmentData = result as Record<string, unknown>;
    }
  } else {
    // 最新のアセスメント結果を取得
    const { data: latestSession } = await supabase
      .from("assessment_sessions")
      .select("id")
      .eq("athlete_id", body.athleteId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();

    if (latestSession) {
      const { data: result } = await supabase
        .from("assessment_results")
        .select("primary_diagnosis, confidence, differentials, red_flags, contraindication_tags, prescription_tags")
        .eq("session_id", latestSession.id as string)
        .single();

      if (result) {
        assessmentData = result as Record<string, unknown>;
      }
    }
  }

  // ----- 既存 SOAP ノート取得（最新 3 件、参考用）-----
  const { data: existingNotes } = await supabase
    .from("soap_notes")
    .select("s_text, o_text, a_text, p_text, created_at")
    .eq("athlete_id", body.athleteId)
    .order("created_at", { ascending: false })
    .limit(3);

  // ----- プロンプト構築 -----
  const contextSections: string[] = [
    buildCdsSystemPrefix(),
    `=== タスク: SOAPノート下書き生成 ===
以下のアスリートデータに基づき、SOAPノートの各セクションを日本語で生成してください。
- S（主観的所見）: 選手の主訴・自覚症状・日常生活への影響
- O（客観的所見）: 測定データ・検査所見・客観的指標
- A（評価）: データに基づく臨床的評価（断言禁止、「〜の可能性が考えられる」等の表現を使用）
- P（計画）: 治療計画・リハビリ方針・フォローアップ`,
    `=== アスリート情報 ===
- ID: ${athlete.id}
- 年齢: ${athlete.age ?? "不明"}
- 性別: ${athlete.sex === "male" ? "男性" : athlete.sex === "female" ? "女性" : "不明"}
${athlete.position ? `- ポジション: ${sanitizeUserInput(String(athlete.position))}` : ""}
${athlete.sport ? `- スポーツ: ${sanitizeUserInput(String(athlete.sport))}` : ""}`,
  ];

  if (metrics && metrics.length > 0) {
    const metricsText = metrics
      .map(
        (m) =>
          `  ${m.date}: NRS=${m.nrs ?? "-"}, RPE=${m.rpe ?? "-"}, CS=${m.conditioning_score ?? "-"}, ACWR=${m.acwr ?? "-"}, 睡眠=${m.sleep_score ?? "-"}`
      )
      .join("\n");
    contextSections.push(`=== 直近の日次メトリクス ===\n${metricsText}`);
  }

  if (assessmentData) {
    contextSections.push(
      `=== 最新アセスメント結果 ===\n${JSON.stringify(assessmentData, null, 2)}`
    );
  }

  if (existingNotes && existingNotes.length > 0) {
    contextSections.push(
      `=== 過去のSOAPノート（参考）===\n直近${existingNotes.length}件のノートが存在します。継続性を考慮して生成してください。`
    );
  }

  contextSections.push(`=== 出力JSON形式（厳守）===
{
  "sText": "主観的所見の本文（日本語、100文字以上推奨）",
  "oText": "客観的所見の本文（日本語、100文字以上推奨）",
  "aText": "評価の本文（日本語、100文字以上推奨、断言禁止）",
  "pText": "計画の本文（日本語、100文字以上推奨）"
}

JSONのみを出力してください。説明文やマークダウンは不要です。`);

  contextSections.push(`\n=== 免責事項 ===\n${MEDICAL_DISCLAIMER}`);

  const fullPrompt = contextSections.join("\n\n");

  // ----- Gemini API 呼び出し -----
  const { result: generated } = await callGeminiWithRetry<GeneratedSoapContent>(
    fullPrompt,
    (text: string) => {
      const parsed = JSON.parse(cleanJsonResponse(text)) as GeneratedSoapContent;
      // 最低限のバリデーション
      if (!parsed.sText || !parsed.oText || !parsed.aText || !parsed.pText) {
        throw new Error("不完全な出力");
      }
      return parsed;
    },
    { userId: user.id, endpoint: "soap-generate" }
  );

  // ----- トークン使用量ログ -----
  await logTokenUsage({
    staffId: user.id,
    endpoint: "soap-generate",
    inputChars: fullPrompt.length,
    estimatedTokens: Math.ceil(fullPrompt.length / 4),
  });

  // ----- レスポンス -----
  return NextResponse.json({
    success: true,
    data: {
      sText: generated.sText,
      oText: generated.oText,
      aText: generated.aText,
      pText: generated.pText,
      disclaimer: MEDICAL_DISCLAIMER,
      aiAssisted: true,
    },
  });
}, { service: 'soap' });
