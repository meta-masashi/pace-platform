/**
 * Supabase Edge Function -- rag-query
 * ============================================================
 * RAG (Retrieve-Augment-Generate) パイプラインの HTTP エンドポイント。
 *
 * リクエスト形式 (POST /functions/v1/rag-query):
 * {
 *   "query": "肩関節のリハビリテーションについて",
 *   "category": "protocol",      // オプション: 検索カテゴリフィルタ
 *   "additionalContext": "..."   // オプション: 追加コンテキスト
 * }
 *
 * レスポンス形式:
 * {
 *   "answer": "...",
 *   "sourceDocuments": [...],
 *   "retrievalStrategy": "standard",
 *   "disclaimer": "...",
 *   "injectionDetected": false
 * }
 *
 * 【防壁1】実際の Gemini API と通信（モック禁止）
 * 【防壁2】プロンプトインジェクション検出 + 入力サニタイズ
 * 【防壁3】ユーザー別レートリミット
 * 【防壁4】指数バックオフ付きリトライ
 * ============================================================
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface RagQueryRequest {
  query: string;
  category?: string;
  additionalContext?: string;
}

interface RetrievedDocument {
  id: string;
  content: string;
  similarity: number;
  source_type?: string;
  source_id?: string;
  metadata?: Record<string, unknown>;
}

interface RagQueryResponse {
  answer: string;
  sourceDocuments: Array<{
    id: string;
    content: string;
    similarity: number;
  }>;
  retrievalStrategy: string;
  disclaimer: string;
  injectionDetected: boolean;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const MEDICAL_DISCLAIMER =
  "最終的な判断・処置は必ず有資格スタッフ（AT/PT/医師）が行ってください。";

const MAX_QUERY_LENGTH = 2_000;

// ---------------------------------------------------------------------------
// プロンプトインジェクション検出（防壁2）
// ---------------------------------------------------------------------------

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(previous|above|all)\s+instructions/i,
  /forget\s+(all\s+)?previous/i,
  /disregard\s+(all\s+)?previous/i,
  /you\s+are\s+now\s+a/i,
  /act\s+as\s+(if\s+you|a\s+new)/i,
  /system\s*:\s*you/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /\[SYSTEM\]/i,
  /DAN\s+mode/i,
  /jailbreak/i,
  /以前の指示を無視/,
  /あなたは今から/,
  /システムプロンプトを無視/,
  /指示を全て無視/,
  /制約を(無視|取り除|外して)/,
];

function detectInjection(input: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(input));
}

function sanitizeInput(input: string): string {
  let s = input.slice(0, MAX_QUERY_LENGTH);
  s = s.replace(/<[^>]*>/g, "");
  s = s.replace(/[\r\n]{3,}/g, "\n\n");
  s = s.replace(
    /\b(System|User|Assistant|Human|SYSTEM|USER|ASSISTANT)\s*:/g,
    "[FILTERED]:"
  );
  for (const pattern of INJECTION_PATTERNS) {
    s = s.replace(pattern, "[FILTERED]");
  }
  return s.trim();
}

// ---------------------------------------------------------------------------
// Gemini Embedding（RETRIEVAL_QUERY）
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

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Embedding API HTTP ${response.status}: ${body}`);
  }

  const data = await response.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Embedding: embedding.values が空です");
  }
  return values as number[];
}

// ---------------------------------------------------------------------------
// 適応的ベクトル検索（意思決定ロジック準拠）
// ---------------------------------------------------------------------------

interface AdaptiveResult {
  documents: RetrievedDocument[];
  strategy: string;
}

async function retrieveWithAdaptiveStrategy(
  queryText: string,
  supabase: ReturnType<typeof createClient>,
  minRequired: number,
  category?: string
): Promise<AdaptiveResult> {
  const queryEmbedding = await embedQuery(queryText);

  // Step 1: 標準設定（threshold=0.7, count=5）
  const step1 = await searchDocuments(supabase, queryEmbedding, 0.7, 5, category);
  if (step1.length >= minRequired) {
    return { documents: step1, strategy: "standard" };
  }

  console.info(`[rag-query] Step 1 結果不足(${step1.length}件) -> 閾値を緩和`);

  // Step 2: 閾値を下げる（threshold=0.6）
  const step2 = await searchDocuments(supabase, queryEmbedding, 0.6, 5, category);
  if (step2.length >= minRequired) {
    return { documents: step2, strategy: "relaxed_threshold" };
  }

  console.info(`[rag-query] Step 2 結果不足(${step2.length}件) -> 件数を増加`);

  // Step 3: 件数を増やす（count=10）
  const step3 = await searchDocuments(supabase, queryEmbedding, 0.6, 10, category);
  if (step3.length >= minRequired) {
    return { documents: step3, strategy: "increased_count" };
  }

  console.info(`[rag-query] Step 3 結果不足(${step3.length}件) -> ハイブリッド検索`);

  // Step 4: 最終結果を返す（0件の場合もあり得る）
  return { documents: step3, strategy: "hybrid" };
}

async function searchDocuments(
  supabase: ReturnType<typeof createClient>,
  queryEmbedding: number[],
  threshold: number,
  count: number,
  category?: string
): Promise<RetrievedDocument[]> {
  const rpcArgs: Record<string, unknown> = {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: count,
  };

  if (category) {
    rpcArgs.filter_source = category;
  }

  const { data, error } = await supabase.rpc("match_documents", rpcArgs);

  if (error) {
    throw new Error(`pgvector 検索失敗: ${error.message}`);
  }

  return (data ?? []) as RetrievedDocument[];
}

// ---------------------------------------------------------------------------
// Gemini 回答生成（指数バックオフ付きリトライ — 防壁4）
// ---------------------------------------------------------------------------

async function callGeminiWithRetry(
  prompt: string,
  maxRetries = 3
): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (attempt > 1) {
      const delay = Math.pow(2, attempt - 1) * 1_000;
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048,
            },
          }),
          signal: AbortSignal.timeout(30_000),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API HTTP ${response.status}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (typeof text !== "string" || text.trim().length === 0) {
        throw new Error("予期しない形式のレスポンス");
      }

      return text.trim();
    } catch (err) {
      lastError = err;
      console.warn(`[rag-query] Gemini attempt ${attempt}/${maxRetries} 失敗:`, err);
    }
  }

  throw new Error(
    `Gemini API 全リトライ失敗: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

// ---------------------------------------------------------------------------
// 出力ガードレール（防壁2: 有害コンテンツ検出）
// ---------------------------------------------------------------------------

const HARMFUL_OUTPUT_PATTERNS: RegExp[] = [
  /診断(します|できます|しました|である|です)/,
  /確定診断/,
  /(処方|投薬)(してください|します|しなさい)/,
  /(手術|外科|切開)(が必要|を推奨|してください)/,
  /you\s+(have|are\s+diagnosed\s+with)/i,
  /prescribe[sd]?\s+\w/i,
  /requires?\s+surgery/i,
];

function detectHarmfulOutput(text: string): boolean {
  return HARMFUL_OUTPUT_PATTERNS.some((p) => p.test(text));
}

// ---------------------------------------------------------------------------
// レートリミットチェック（防壁3）
// ---------------------------------------------------------------------------

async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  const windowMs = 60_000;
  const maxRequests = 10;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs).toISOString();

  const { count, error } = await supabase
    .from("rate_limit_log")
    .select("id", { count: "exact", head: true })
    .eq("key", `${userId}:rag-query`)
    .gte("ts", windowStart);

  if (error) {
    console.warn("[rag-query] レートリミットチェック失敗:", error.message);
    return true; // フォールバック: 許可
  }

  if ((count ?? 0) >= maxRequests) {
    return false;
  }

  // 記録
  await supabase.from("rate_limit_log").insert({
    key: `${userId}:rag-query`,
  });

  return true;
}

// ---------------------------------------------------------------------------
// RAG プロンプト構築
// ---------------------------------------------------------------------------

function buildRagPrompt(
  context: string,
  query: string,
  additionalContext?: string
): string {
  const systemPrefix = `あなたはスポーツ医学クリニカル・ディシジョン・サポート（CDS）AIアシスタントです。
以下のルールを厳守してください:
1. 医療診断を断言しないこと
2. 処方・投薬指示を出さないこと
3. 外科的処置を推奨しないこと
4. 最終判断は必ず有資格スタッフが行う旨を明記すること
5. 回答は日本語で具体的かつ実践的にすること

`;

  const additionalSection = additionalContext
    ? `\n=== 追加コンテキスト ===\n${additionalContext}\n`
    : "";

  return `${systemPrefix}
以下の参考資料に基づいて回答してください。
参考資料に記載されていない情報は「その情報は持ち合わせていません」と正直に答えてください。

=== 参考資料 ===
${context}
=== 参考資料ここまで ===
${additionalSection}
質問: ${query}

回答:`;
}

// ---------------------------------------------------------------------------
// メインハンドラー
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  // CORS
  const allowedOrigin = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...(allowedOrigin && origin === allowedOrigin
      ? { "Access-Control-Allow-Origin": allowedOrigin }
      : {}),
  };

  if (req.method === "OPTIONS") {
    if (!allowedOrigin || origin !== allowedOrigin) {
      return new Response("Forbidden", { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "POST のみ受け付けます" },
      { status: 405, headers: corsHeaders }
    );
  }

  // Supabase 初期化
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey) {
    return Response.json(
      { error: "Supabase 環境変数が未設定です" },
      { status: 500, headers: corsHeaders }
    );
  }

  // 認証チェック
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
  let userId = "anonymous";

  if (!isServiceRole) {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();
    if (authError || !user) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }
    userId = user.id;
  }

  // Admin クライアント
  if (!serviceRoleKey) {
    return Response.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY が未設定です" },
      { status: 500, headers: corsHeaders }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // レートリミットチェック（防壁3）
  const allowed = await checkRateLimit(supabase, userId);
  if (!allowed) {
    return Response.json(
      {
        error: "レートリミットを超過しました。1分後に再試行してください。",
        retryAfter: 60,
      },
      { status: 429, headers: corsHeaders }
    );
  }

  // リクエストボディ解析
  let body: RagQueryRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "リクエストボディが無効なJSONです" },
      { status: 400, headers: corsHeaders }
    );
  }

  const { query, category, additionalContext } = body;

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return Response.json(
      { error: "query は必須です" },
      { status: 400, headers: corsHeaders }
    );
  }

  // プロンプトインジェクション検出（防壁2）
  if (detectInjection(query)) {
    console.warn(
      `[rag-query] プロンプトインジェクション検出: userId=${userId}`
    );
    const result: RagQueryResponse = {
      answer:
        "不適切な入力を検出しました。質問の内容を変更してお試しください。",
      sourceDocuments: [],
      retrievalStrategy: "blocked",
      disclaimer: MEDICAL_DISCLAIMER,
      injectionDetected: true,
    };
    return Response.json(result, { status: 200, headers: corsHeaders });
  }

  // 入力サニタイズ
  const sanitizedQuery = sanitizeInput(query);

  try {
    // Step 1-3: 適応的ベクトル検索（Retrieve）
    const { documents, strategy } = await retrieveWithAdaptiveStrategy(
      sanitizedQuery,
      supabase,
      2,
      category
    );

    // 関連ドキュメントが見つからない場合
    if (documents.length === 0) {
      const result: RagQueryResponse = {
        answer:
          "関連する情報が見つかりませんでした。質問の表現を変えてお試しください。",
        sourceDocuments: [],
        retrievalStrategy: strategy,
        disclaimer: MEDICAL_DISCLAIMER,
        injectionDetected: false,
      };
      return Response.json(result, { status: 200, headers: corsHeaders });
    }

    // Step 4: コンテキスト組み立て（Augment）
    const context = documents
      .map(
        (doc, i) =>
          `[参考資料 ${i + 1}] (類似度: ${(doc.similarity * 100).toFixed(0)}%)\n${doc.content}`
      )
      .join("\n\n---\n\n");

    // Step 5: プロンプト構築
    const prompt = buildRagPrompt(context, sanitizedQuery, additionalContext);

    // Step 6: Gemini で回答生成（Generate — 防壁4: リトライ付き）
    let answer = await callGeminiWithRetry(prompt);

    // 出力ガードレール（防壁2）
    if (detectHarmfulOutput(answer)) {
      console.warn("[rag-query] 有害コンテンツ検出 — 回答を差し替え");
      answer =
        "回答の生成中に安全基準に違反するコンテンツが検出されました。質問を変更してお試しください。";
    }

    // トークン使用量記録（ベストエフォート）
    try {
      await supabase.from("gemini_token_log").insert({
        staff_id: userId,
        endpoint: "rag-query",
        input_chars: prompt.length,
        estimated_tokens: Math.ceil(prompt.length / 4),
        called_at: new Date().toISOString(),
      });
    } catch {
      // 非致命的 — ログ失敗はリクエストをブロックしない
    }

    const result: RagQueryResponse = {
      answer,
      sourceDocuments: documents.map((d) => ({
        id: d.id,
        content:
          d.content.slice(0, 200) + (d.content.length > 200 ? "..." : ""),
        similarity: d.similarity,
      })),
      retrievalStrategy: strategy,
      disclaimer: MEDICAL_DISCLAIMER,
      injectionDetected: false,
    };

    console.info(
      `[rag-query] 完了: userId=${userId} strategy=${strategy} docs=${documents.length}`
    );

    return Response.json(result, { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("[rag-query] パイプラインエラー:", err);
    return Response.json(
      {
        error: `RAG パイプラインエラー: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500, headers: corsHeaders }
    );
  }
});
