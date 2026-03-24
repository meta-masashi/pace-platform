/**
 * POST /api/billing/code
 *
 * SOAP自動コーディングAPI (P6-029)
 * SOAPノートのアセスメント（a_text）から Gemini 2.0 Flash を使って
 * ICD-10-CM 傷病コードと診療報酬処置コードを自動抽出する。
 *
 * - master ロールのみ使用可
 * - 出力に「診断確定」「処方」「投薬」が含まれる場合は 403
 * - JSONパース失敗時は 3 回リトライ
 *
 * リクエスト: { soap_note_id: string, assessment_id?: string }
 * レスポンス: {
 *   diagnosis_code: string,
 *   diagnosis_label: string,
 *   procedure_codes: ProcedureCode[],
 *   total_points: number,
 *   ai_confidence: number
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { callGeminiWithRetry, buildCdsSystemPrefix, cleanJsonText } from "@/lib/gemini-client";

function getDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ProcedureCode {
  code: string;
  description: string;
  unit_price: number;
  quantity: number;
}

interface CodingOutput {
  diagnosis_code: string;
  diagnosis_label: string;
  diagnosis_label_ja: string;
  procedure_codes: ProcedureCode[];
  total_points: number;
  ai_confidence: number; // 0.0〜1.0
  reasoning: string;
}

// ---------------------------------------------------------------------------
// ガードレール
// ---------------------------------------------------------------------------

const CODING_GUARDRAIL_PATTERNS: RegExp[] = [
  /診断確定/,
  /確定診断/,
  /処方します/,
  /投薬/,
  /手術適応/,
];

function containsCodingViolation(text: string): boolean {
  return CODING_GUARDRAIL_PATTERNS.some((p) => p.test(text));
}

// ---------------------------------------------------------------------------
// プロンプト構築
// ---------------------------------------------------------------------------

function buildCodingPrompt(
  soapText: { s: string; o: string; a: string; p: string },
  diagnosisLabel: string | null
): string {
  return `${buildCdsSystemPrefix()}
以下のSOAPノートから、保険請求に必要なコーディングをJSON形式で出力してください。

【SOAPノート】
S（主観的情報）: ${soapText.s || "記載なし"}
O（客観的情報）: ${soapText.o || "記載なし"}
A（アセスメント）: ${soapText.a || "記載なし"}
P（プラン）: ${soapText.p || "記載なし"}

${diagnosisLabel ? `【ベイズ推論アセスメント結果】\n主診断: ${diagnosisLabel}\n` : ""}

【出力形式（必ずこのJSONのみ返答）】
{
  "diagnosis_code": "（ICD-10-CM コード例: M25.511）",
  "diagnosis_label": "（ICD-10-CM 英語ラベル）",
  "diagnosis_label_ja": "（日本語説明）",
  "procedure_codes": [
    {
      "code": "（診療報酬処置コード）",
      "description": "（処置名）",
      "unit_price": 数値（点数）,
      "quantity": 数値（回数）
    }
  ],
  "total_points": 数値（合計点数）,
  "ai_confidence": 数値（0.0〜1.0, このコーディングへの確信度）,
  "reasoning": "（コーディング根拠を1〜2文で）"
}

【厳守ルール】
- 「診断確定」「確定診断」「処方します」「投薬」「手術適応」などの医療的断定ワードは禁止
- コーディングは「提案」であり最終確認はスタッフが行う旨を reasoning に含める
- ICD-10-CM コードは有効なコード形式（英字1文字 + 数字2-7文字）のみ使用
- procedure_codes が不明な場合は空配列 [] を返す
- 必ずJSON形式のみ返答（コードブロック・説明文は不要）
`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ── master ロール認証 ────────────────────────────────────────────────────
    const supabaseAuth = await createClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    const { data: staff } = await db
      .from("staff").select("id, org_id, role").eq("id", user.id).maybeSingle();

    if (!staff) {
      return NextResponse.json({ error: "Staff record not found" }, { status: 403 });
    }
    if (staff.role !== "master") {
      return NextResponse.json({ error: "請求コーディングは master ロールのみ使用できます" }, { status: 403 });
    }

    // ── リクエスト ──────────────────────────────────────────────────────────
    let body: { soap_note_id?: string; assessment_id?: string };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { soap_note_id, assessment_id } = body;
    if (!soap_note_id) {
      return NextResponse.json({ error: "soap_note_id is required" }, { status: 400 });
    }

    // ── SOAPノート取得 ───────────────────────────────────────────────────────
    const { data: soap } = await db
      .from("soap_notes")
      .select("id, athlete_id, s_text, o_text, a_text, p_text")
      .eq("id", soap_note_id)
      .maybeSingle();

    if (!soap) {
      return NextResponse.json({ error: "SOAP note not found" }, { status: 404 });
    }

    // 同組織チェック
    const { data: athlete } = await db
      .from("athletes").select("id").eq("id", soap.athlete_id).eq("org_id", staff.org_id).maybeSingle();
    if (!athlete) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── アセスメント結果（ベイズ推論）取得（任意）─────────────────────────────
    let diagnosisLabel: string | null = null;
    if (assessment_id) {
      const { data: assessment } = await db
        .from("assessments")
        .select("primary_diagnosis")
        .eq("id", assessment_id)
        .eq("athlete_id", soap.athlete_id)
        .maybeSingle();
      if (assessment?.primary_diagnosis) {
        diagnosisLabel = (assessment.primary_diagnosis as { label: string }).label ?? null;
      }
    }

    // ── Gemini でコーディング生成 ─────────────────────────────────────────────
    const prompt = buildCodingPrompt(
      { s: soap.s_text, o: soap.o_text, a: soap.a_text, p: soap.p_text },
      diagnosisLabel
    );

    let coding: CodingOutput;
    try {
      const { result } = await callGeminiWithRetry<CodingOutput>(
        prompt,
        (text) => {
          const parsed = JSON.parse(cleanJsonText(text)) as CodingOutput;
          if (!parsed.diagnosis_code || !parsed.diagnosis_label) {
            throw new Error("Invalid coding output structure");
          }
          return parsed;
        },
        { userId: staff.id, endpoint: "billing-code" }
      );
      coding = result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "RATE_LIMIT_EXCEEDED") {
        return NextResponse.json(
          { error: "レート制限に達しました" },
          { status: 429 }
        );
      }
      console.error("[billing/code] Gemini error:", msg);
      return NextResponse.json({ error: "Failed to generate billing codes" }, { status: 502 });
    }

    // ── ガードレールチェック ─────────────────────────────────────────────────
    if (containsCodingViolation(JSON.stringify(coding))) {
      return NextResponse.json(
        { error: "生成されたコーディングに不適切なワードが含まれていました" },
        { status: 403 }
      );
    }

    return NextResponse.json(coding);
  } catch (err) {
    console.error("[billing/code] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
