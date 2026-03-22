import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { DiagnosisResult, DailyMetric } from "@/types";
import { checkRateLimit, extractUserId } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const CDS_DISCLAIMER =
  "※ このSOAPノート下書きはAI生成による臨床意思決定支援情報です。医療専門家による判断を優先し、最終記録は必ず担当スタッフが確認・編集してください。";

interface SoapAssistRequest {
  athlete_id: string;
  assessment_result: {
    primary_diagnosis?: DiagnosisResult;
    differentials: DiagnosisResult[];
    prescription_tags: string[];
    contraindication_tags: string[];
    is_emergency: boolean;
  };
  daily_metrics?: DailyMetric;
  existing_notes?: string;
}

interface SoapDraft {
  s_draft: string;
  o_draft: string;
  a_draft: string;
  p_draft: string;
}

/** Fallback SOAP draft returned when all Gemini retries fail */
const FALLBACK_SOAP_DRAFT: SoapDraft = {
  s_draft:
    "（AI生成失敗のためフォールバック）選手の主訴・自覚症状を直接確認し、このフィールドを更新してください。",
  o_draft:
    "（AI生成失敗のためフォールバック）客観的所見・測定値・テスト結果を記入してください。",
  a_draft:
    "（AI生成失敗のためフォールバック）アセスメント結果をもとに評価・判断を記入してください。",
  p_draft:
    "（AI生成失敗のためフォールバック）今後の治療計画・禁忌事項・次回評価予定を記入してください。",
};

function buildSoapPrompt(req: SoapAssistRequest, retryHint = false): string {
  const { assessment_result, daily_metrics, existing_notes } = req;
  const primary = assessment_result.primary_diagnosis;

  const retryPrefix = retryHint
    ? `【重要】前回の出力がJSON形式ではありませんでした。今回は必ず指定されたJSONオブジェクトのみを出力してください。説明文・マークダウン・コードブロックは一切不要です。\n\n`
    : "";

  return `${retryPrefix}あなたはスポーツ医学専門のSOAPノート作成AIアシスタントです。
以下の情報をもとに、日本語でSOAPノートの各セクションの下書きを作成してください。

## アセスメント結果
- 主診断: ${primary ? `${primary.label}（${primary.diagnosis_code}）確率 ${Math.round(primary.probability * 100)}%` : "未確定"}
- 鑑別診断:
${assessment_result.differentials.slice(0, 3).map((d) => `  - ${d.label} ${Math.round(d.probability * 100)}%`).join("\n")}
- 処方タグ: ${assessment_result.prescription_tags.join(", ") || "なし"}
- 禁忌タグ: ${assessment_result.contraindication_tags.join(", ") || "なし"}
- 緊急フラグ: ${assessment_result.is_emergency ? "あり（要緊急対応）" : "なし"}

## バイタル・指標（本日）
${daily_metrics ? `- NRS（疼痛）: ${daily_metrics.nrs}/10
- HRV: ${daily_metrics.hrv} ms
- ACWR: ${daily_metrics.acwr}
- 睡眠スコア: ${daily_metrics.sleep_score}/5
- 主観的コンディション: ${daily_metrics.subjective_condition}/5` : "データなし"}

## 既存メモ
${existing_notes || "なし"}

## 出力形式
必ず以下のJSONのみを出力してください（コードブロックや説明文は不要）:
{
  "s_draft": "S（Subjective）セクション: 選手の主訴・自覚症状・訴え",
  "o_draft": "O（Objective）セクション: 客観的所見・測定値・テスト結果",
  "a_draft": "A（Assessment）セクション: 評価・判断・診断根拠",
  "p_draft": "P（Plan）セクション: 今後の治療計画・禁忌事項・次回評価予定"
}

各セクションは2〜4文の簡潔な日本語で記述してください。
臨床的に正確で、他のスタッフが即座に理解できる内容にしてください。`.trim();
}

/** Strip markdown code fences and return cleaned JSON text */
function cleanJsonText(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** Call Gemini with retry on JSON parse failure (up to maxRetries additional attempts) */
async function generateWithRetry(
  req: SoapAssistRequest,
  maxRetries = 2
): Promise<SoapDraft> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prompt = buildSoapPrompt(req, attempt > 0);

    try {
      const result = await model.generateContent(prompt);
      const rawText = result.response.text().trim();
      const jsonText = cleanJsonText(rawText);
      const parsed = JSON.parse(jsonText) as SoapDraft;

      if (
        !parsed.s_draft ||
        !parsed.o_draft ||
        !parsed.a_draft ||
        !parsed.p_draft
      ) {
        throw new Error("Incomplete SOAP fields in response");
      }

      return parsed;
    } catch (err) {
      lastError = err;
      console.warn(
        `[soap-assist] JSON parse attempt ${attempt + 1} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.error("[soap-assist] All Gemini retries exhausted:", lastError);
  throw new Error("GEMINI_PARSE_EXHAUSTED");
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ─────────────────────────────────────────────────────────
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // ── Rate limiting ──────────────────────────────────────────────────────
    const userId = extractUserId(request);
    const rl = await checkRateLimit(userId, "soap-assist");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "レート制限: 1分あたり10回まで。しばらく待ってから再試行してください。" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rl.resetAt),
            "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const body = (await request.json()) as SoapAssistRequest;
    const { athlete_id, assessment_result } = body;

    if (!athlete_id || !assessment_result) {
      return NextResponse.json(
        { error: "athlete_id and assessment_result are required" },
        { status: 400 }
      );
    }

    // ── Gemini call with JSON retry ────────────────────────────────────────
    let soapDraft: SoapDraft;
    let usedFallback = false;

    try {
      soapDraft = await generateWithRetry(body);
    } catch {
      soapDraft = FALLBACK_SOAP_DRAFT;
      usedFallback = true;
    }

    return NextResponse.json(
      {
        athlete_id,
        generated_at: new Date().toISOString(),
        s_draft: soapDraft.s_draft,
        o_draft: soapDraft.o_draft,
        a_draft: soapDraft.a_draft,
        p_draft: soapDraft.p_draft,
        fallback_used: usedFallback,
        cds_disclaimer: CDS_DISCLAIMER,
      },
      {
        headers: {
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(rl.resetAt),
        },
      }
    );
  } catch (err) {
    console.error("[ai/soap-assist]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
