/**
 * Supabase Edge Function -- eval-runner
 * ============================================================
 * AI 精度評価フレームワークの HTTP エンドポイント。
 * RAG 検索精度・LLM 出力品質を計測し、evaluation_runs テーブルに保存する。
 *
 * リクエスト形式 (POST /functions/v1/eval-runner):
 * {
 *   "runId": "eval_20260329_001",         // オプション: 自動生成
 *   "evaluationType": "rag",               // "rag" | "llm_quality" | "composite"
 *   "ragCases": [{                          // evaluationType === "rag" の場合
 *     "caseId": "case_001",
 *     "query": "肩関節のリハビリ",
 *     "expectedKeywords": ["肩", "可動域", "ストレッチ"],
 *     "category": "protocol"
 *   }],
 *   "llmCases": [{                          // evaluationType === "llm_quality" の場合
 *     "caseId": "case_002",
 *     "referenceText": "...",
 *     "generatedText": "..."
 *   }]
 * }
 *
 * 認証: Service Role のみ（内部運用専用）
 * ============================================================
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface RagEvalCase {
  caseId: string;
  query: string;
  /** キーワード一致でパスを判定 */
  expectedKeywords: string[];
  /** カテゴリフィルタ */
  category?: string;
  tags?: string[];
}

interface LlmQualityCase {
  caseId: string;
  referenceText: string;
  generatedText: string;
  tags?: string[];
}

interface EvalRequest {
  runId?: string;
  evaluationType: "rag" | "llm_quality" | "composite";
  ragCases?: RagEvalCase[];
  llmCases?: LlmQualityCase[];
  metadata?: Record<string, unknown>;
}

interface EvalMetrics {
  ragPassRate?: number;
  avgKeywordHitRate?: number;
  avgCosineSimilarity?: number;
  overallPassRate?: number;
}

interface CaseResult {
  caseId: string;
  passed: boolean;
  score: number;
  detail: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Gemini Embedding（BERTScore 近似計算用）
// ---------------------------------------------------------------------------

async function embedText(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_DOCUMENT",
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Embedding API HTTP ${response.status}: ${body}`);
  }

  const data = await response.json();
  return (data?.embedding?.values ?? []) as number[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// RAG パイプライン呼び出し（評価対象）
// ---------------------------------------------------------------------------

async function embedQuery(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
      }),
    }
  );

  if (!response.ok) throw new Error(`Embedding API Error: ${response.status}`);
  const data = await response.json();
  return (data?.embedding?.values ?? []) as number[];
}

async function callGeminiForEval(prompt: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt - 1) * 1_000));
    }
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
          }),
          signal: AbortSignal.timeout(30_000),
        }
      );
      if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") throw new Error("Empty response");
      return text.trim();
    } catch (err) {
      if (attempt === 3) throw err;
      console.warn(`[eval-runner] Gemini attempt ${attempt}/3 failed:`, err);
    }
  }
  throw new Error("Gemini all retries exhausted");
}

// ---------------------------------------------------------------------------
// RAG 評価ロジック
// ---------------------------------------------------------------------------

async function evaluateRagCases(
  cases: RagEvalCase[],
  supabase: ReturnType<typeof createClient>
): Promise<{ metrics: Partial<EvalMetrics>; results: CaseResult[] }> {
  const results: CaseResult[] = [];
  let totalKeywordHitRate = 0;

  for (const testCase of cases) {
    try {
      // ベクトル検索
      const queryEmbedding = await embedQuery(testCase.query);
      const { data: docs } = await supabase.rpc("match_documents", {
        query_embedding: queryEmbedding,
        match_threshold: 0.6,
        match_count: 5,
        ...(testCase.category ? { filter_source: testCase.category } : {}),
      });

      const context = (docs ?? [])
        .map((d: { content: string }, i: number) => `[${i + 1}] ${d.content}`)
        .join("\n\n");

      // Gemini で回答生成
      const prompt = `以下の参考資料に基づいて、質問に日本語で回答してください。
参考資料に記載されていない情報は「その情報は持ち合わせていません」と答えてください。

=== 参考資料 ===
${context || "(参考資料なし)"}
===

質問: ${testCase.query}

回答:`;

      const answer = await callGeminiForEval(prompt);

      // キーワードマッチ判定
      const lowerAnswer = answer.toLowerCase();
      const hitCount = testCase.expectedKeywords.filter((kw) =>
        lowerAnswer.includes(kw.toLowerCase())
      ).length;
      const hitRate = testCase.expectedKeywords.length > 0
        ? hitCount / testCase.expectedKeywords.length
        : 0;
      const passed = hitRate >= 0.5; // 50% 以上のキーワードがヒットすれば合格

      totalKeywordHitRate += hitRate;

      results.push({
        caseId: testCase.caseId,
        passed,
        score: hitRate,
        detail: {
          expectedKeywords: testCase.expectedKeywords,
          hitKeywords: testCase.expectedKeywords.filter((kw) =>
            lowerAnswer.includes(kw.toLowerCase())
          ),
          answerPreview: answer.slice(0, 300),
          docsRetrieved: (docs ?? []).length,
        },
      });
    } catch (err) {
      console.error(`[eval-runner] RAG ケース ${testCase.caseId} 失敗:`, err);
      results.push({
        caseId: testCase.caseId,
        passed: false,
        score: 0,
        detail: {
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  const passCount = results.filter((r) => r.passed).length;

  return {
    metrics: {
      ragPassRate: cases.length > 0 ? passCount / cases.length : 0,
      avgKeywordHitRate: cases.length > 0 ? totalKeywordHitRate / cases.length : 0,
    },
    results,
  };
}

// ---------------------------------------------------------------------------
// LLM 品質評価ロジック（BERTScore 近似）
// ---------------------------------------------------------------------------

async function evaluateLlmCases(
  cases: LlmQualityCase[]
): Promise<{ metrics: Partial<EvalMetrics>; results: CaseResult[] }> {
  const results: CaseResult[] = [];
  let totalSimilarity = 0;

  for (const testCase of cases) {
    try {
      const [refEmbed, genEmbed] = await Promise.all([
        embedText(testCase.referenceText),
        embedText(testCase.generatedText),
      ]);

      const similarity = cosineSimilarity(refEmbed, genEmbed);
      const passed = similarity >= 0.7;
      totalSimilarity += similarity;

      results.push({
        caseId: testCase.caseId,
        passed,
        score: similarity,
        detail: { cosineSimilarity: similarity },
      });
    } catch (err) {
      console.error(`[eval-runner] LLM ケース ${testCase.caseId} 失敗:`, err);
      results.push({
        caseId: testCase.caseId,
        passed: false,
        score: 0,
        detail: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  return {
    metrics: {
      avgCosineSimilarity: cases.length > 0 ? totalSimilarity / cases.length : 0,
    },
    results,
  };
}

// ---------------------------------------------------------------------------
// メインハンドラー
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "POST のみ受け付けます" }, { status: 405 });
  }

  // 認証: Service Role のみ（内部運用専用）
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: "Supabase 環境変数が未設定です" }, { status: 500 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return Response.json(
      { error: "Unauthorized: Service Role 認証が必要です" },
      { status: 401 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // リクエスト解析
  let body: EvalRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "無効なJSONです" }, { status: 400 });
  }

  const { evaluationType, ragCases, llmCases, metadata } = body;
  const runId = body.runId ?? `eval_${Date.now()}`;
  const startedAt = new Date().toISOString();

  if (!["rag", "llm_quality", "composite"].includes(evaluationType)) {
    return Response.json(
      { error: `無効な evaluationType: ${evaluationType}` },
      { status: 400 }
    );
  }

  const metrics: EvalMetrics = {};
  const allResults: CaseResult[] = [];

  try {
    // RAG 評価
    if (
      (evaluationType === "rag" || evaluationType === "composite") &&
      ragCases &&
      ragCases.length > 0
    ) {
      console.info(`[eval-runner] RAG 評価開始: ${ragCases.length} ケース`);
      const ragEval = await evaluateRagCases(ragCases, supabase);
      Object.assign(metrics, ragEval.metrics);
      allResults.push(...ragEval.results);
      console.info(
        `[eval-runner] RAG 評価完了: passRate=${ragEval.metrics.ragPassRate?.toFixed(3)}`
      );
    }

    // LLM 品質評価
    if (
      (evaluationType === "llm_quality" || evaluationType === "composite") &&
      llmCases &&
      llmCases.length > 0
    ) {
      console.info(`[eval-runner] LLM 品質評価開始: ${llmCases.length} ケース`);
      const llmEval = await evaluateLlmCases(llmCases);
      Object.assign(metrics, llmEval.metrics);
      allResults.push(...llmEval.results);
      console.info(
        `[eval-runner] LLM 品質評価完了: avgCosine=${llmEval.metrics.avgCosineSimilarity?.toFixed(3)}`
      );
    }

    // 総合パスレート
    metrics.overallPassRate =
      allResults.length > 0
        ? allResults.filter((r) => r.passed).length / allResults.length
        : 0;

    const completedAt = new Date().toISOString();

    // evaluation_runs テーブルに保存
    const { error: saveError } = await supabase
      .from("evaluation_runs")
      .insert({
        run_id: runId,
        evaluation_type: evaluationType,
        started_at: startedAt,
        completed_at: completedAt,
        metrics,
        case_results: allResults,
        metadata: metadata ?? {},
      });

    if (saveError) {
      console.error("[eval-runner] 保存失敗:", saveError.message);
      return Response.json(
        {
          error: `評価結果の保存に失敗しました: ${saveError.message}`,
          metrics,
          caseResults: allResults,
        },
        { status: 500 }
      );
    }

    console.info(
      `[eval-runner] 評価完了: runId=${runId} type=${evaluationType} passRate=${metrics.overallPassRate.toFixed(3)}`
    );

    return Response.json(
      {
        runId,
        evaluationType,
        startedAt,
        completedAt,
        metrics,
        caseResults: allResults,
        totalCases: allResults.length,
        passedCases: allResults.filter((r) => r.passed).length,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[eval-runner] 評価エラー:", err);
    return Response.json(
      {
        error: `評価実行中にエラーが発生しました: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 500 }
    );
  }
});
