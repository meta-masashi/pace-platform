/**
 * Supabase Edge Function -- dify-workflow
 * ============================================================
 * Dify API ワークフロー実行の HTTP エンドポイント。
 * SSE ストリーミング対応。Dify 障害時は Gemini フォールバック。
 *
 * リクエスト形式 (POST /functions/v1/dify-workflow):
 * {
 *   "workflowId": "rehab-protocol-generator",
 *   "inputs": { "injury_description": "...", "athlete_profile": "..." },
 *   "streaming": true   // オプション（デフォルト: true）
 * }
 *
 * ストリーミング: SSE (text/event-stream) で返す
 * ブロッキング:   JSON で outputs を返す
 *
 * 【防壁1】実際の Dify API と通信（モック禁止）
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

type PaceWorkflowId =
  | "rehab-protocol-generator"
  | "injury-risk-analyzer"
  | "return-to-play-advisor";

const VALID_WORKFLOW_IDS: PaceWorkflowId[] = [
  "rehab-protocol-generator",
  "injury-risk-analyzer",
  "return-to-play-advisor",
];

interface DifyWorkflowRequest {
  workflowId: PaceWorkflowId;
  inputs: Record<string, string>;
  streaming?: boolean;
}

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
  let s = input.slice(0, 5_000);
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
// Dify API 呼び出し
// ---------------------------------------------------------------------------

function getDifyApiBase(): string {
  const base = Deno.env.get("DIFY_API_BASE");
  if (!base) throw new Error("DIFY_API_BASE が設定されていません");
  return base.replace(/\/$/, "");
}

function getDifyApiKey(workflowId: PaceWorkflowId): string {
  const envKey = `DIFY_API_KEY_${workflowId.replace(/-/g, "_").toUpperCase()}`;
  const specificKey = Deno.env.get(envKey);
  if (specificKey) return specificKey;

  const commonKey = Deno.env.get("DIFY_API_KEY");
  if (!commonKey) {
    throw new Error(
      `Dify API キーが設定されていません。${envKey} または DIFY_API_KEY を設定してください。`
    );
  }
  return commonKey;
}

async function callDifyWorkflow(
  workflowId: PaceWorkflowId,
  inputs: Record<string, string>,
  userId: string,
  streaming: boolean
): Promise<Response> {
  const apiBase = getDifyApiBase();
  const apiKey = getDifyApiKey(workflowId);

  const response = await fetch(`${apiBase}/v1/workflows/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs,
      response_mode: streaming ? "streaming" : "blocking",
      user: userId,
    }),
    signal: AbortSignal.timeout(streaming ? 60_000 : 120_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Dify API HTTP ${response.status}: ${body}`);
  }

  return response;
}

// ---------------------------------------------------------------------------
// Gemini フォールバック（防壁4: リトライ付き）
// ---------------------------------------------------------------------------

const WORKFLOW_PROMPTS: Record<PaceWorkflowId, string> = {
  "rehab-protocol-generator": `以下のアスリート情報に基づいて、段階的なリハビリプロトコルをJSON形式で生成してください。
フェーズ別（急性期 / 回復期 / 機能回復期）で設計し、各エクササイズにセット数・レップ数・注意事項を含めること。`,

  "injury-risk-analyzer": `以下のデータに基づいて、受傷リスクを分析しJSONで出力してください。
リスクレベル（critical/high/medium/low）・主要リスク因子・推奨対策を含めること。`,

  "return-to-play-advisor": `以下のアスリートデータに基づいて、復帰可否の判断支援情報をJSONで出力してください。
RTP段階（段階1-6）・現在の推奨段階・チェックリスト・注意事項を含めること。
最終判断は有資格スタッフが行う旨を明記すること。`,
};

async function geminiWorkflowFallback(
  workflowId: PaceWorkflowId,
  inputs: Record<string, string>,
  maxRetries = 3
): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");

  const systemPrefix = `あなたはスポーツ医学クリニカル・ディシジョン・サポート（CDS）AIアシスタントです。
以下のルールを厳守してください:
1. 医療診断を断言しないこと
2. 処方・投薬指示を出さないこと
3. 外科的処置を推奨しないこと
4. 最終判断は必ず有資格スタッフが行う旨を明記すること

`;

  const inputSection = Object.entries(inputs)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const prompt = `${systemPrefix}${WORKFLOW_PROMPTS[workflowId]}

入力情報:
${inputSection}`;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
          }),
          signal: AbortSignal.timeout(30_000),
        }
      );

      if (!response.ok) throw new Error(`Gemini API HTTP ${response.status}`);

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") throw new Error("予期しない形式のレスポンス");
      return text.trim();
    } catch (err) {
      lastError = err;
      console.warn(`[dify-workflow] Gemini fallback attempt ${attempt}/${maxRetries} 失敗:`, err);
    }
  }

  throw new Error(
    `Gemini フォールバック全リトライ失敗: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

// ---------------------------------------------------------------------------
// レートリミットチェック（防壁3）
// ---------------------------------------------------------------------------

async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  const windowMs = 60_000;
  const maxRequests = 5; // Dify はコストが高いため制限を厳しくする
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  const { count, error } = await supabase
    .from("rate_limit_log")
    .select("id", { count: "exact", head: true })
    .eq("key", `${userId}:dify-workflow`)
    .gte("ts", windowStart);

  if (error) {
    console.warn("[dify-workflow] レートリミットチェック失敗:", error.message);
    return true;
  }

  if ((count ?? 0) >= maxRequests) return false;

  await supabase.from("rate_limit_log").insert({
    key: `${userId}:dify-workflow`,
  });

  return true;
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
    return Response.json({ error: "POST のみ受け付けます" }, { status: 405, headers: corsHeaders });
  }

  // Supabase 初期化
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return Response.json(
      { error: "Supabase 環境変数が未設定です" },
      { status: 500, headers: corsHeaders }
    );
  }

  // 認証チェック
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
  let userId = "service";

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
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }
    userId = user.id;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // レートリミット（防壁3）
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

  // リクエストボディ
  let body: DifyWorkflowRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "リクエストボディが無効なJSONです" },
      { status: 400, headers: corsHeaders }
    );
  }

  const { workflowId, inputs, streaming = true } = body;

  // workflowId バリデーション
  if (!VALID_WORKFLOW_IDS.includes(workflowId)) {
    return Response.json(
      { error: `無効な workflowId: ${workflowId}` },
      { status: 400, headers: corsHeaders }
    );
  }

  // 全 inputs のインジェクション検出（防壁2）
  for (const [key, value] of Object.entries(inputs)) {
    if (detectInjection(value)) {
      console.warn(
        `[dify-workflow] プロンプトインジェクション検出: workflow=${workflowId} field=${key} userId=${userId}`
      );
      return Response.json(
        { error: "不適切な入力を検出しました。入力内容を変更してお試しください。" },
        { status: 400, headers: corsHeaders }
      );
    }
  }

  // 全 inputs をサニタイズ（防壁2）
  const sanitizedInputs: Record<string, string> = {};
  for (const [key, value] of Object.entries(inputs)) {
    sanitizedInputs[key] = sanitizeInput(value);
  }

  // Dify API 呼び出し（リトライ付き — 防壁4）
  let difySucceeded = false;

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt - 1) * 1_000));
    }

    try {
      const difyResponse = await callDifyWorkflow(
        workflowId,
        sanitizedInputs,
        userId,
        streaming
      );

      if (streaming && difyResponse.body) {
        // SSE ストリーミングレスポンスをプロキシ
        console.info(`[dify-workflow] SSE ストリーミング開始: workflow=${workflowId} userId=${userId}`);
        return new Response(difyResponse.body, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      // ブロッキングモード
      const data = await difyResponse.json();
      const outputs = data?.data?.outputs ?? data?.outputs ?? {};

      console.info(`[dify-workflow] ブロッキング完了: workflow=${workflowId} userId=${userId}`);
      difySucceeded = true;

      return Response.json(
        {
          workflowId,
          outputs,
          backend: "dify",
        },
        { status: 200, headers: corsHeaders }
      );
    } catch (err) {
      console.warn(`[dify-workflow] Dify attempt ${attempt}/3 失敗:`, err);

      // 4xx エラーはリトライしない
      if (err instanceof Error && /HTTP 4\d\d/.test(err.message)) {
        break;
      }
    }
  }

  // Dify 失敗 -> Gemini フォールバック
  if (!difySucceeded) {
    console.warn(
      `[dify-workflow] Dify API 失敗、Gemini フォールバック: workflow=${workflowId}`
    );

    try {
      const fallbackText = await geminiWorkflowFallback(
        workflowId,
        sanitizedInputs
      );

      // トークン記録（ベストエフォート）
      try {
        await supabase.from("gemini_token_log").insert({
          staff_id: userId,
          endpoint: `dify-fallback-${workflowId}`,
          input_chars: fallbackText.length,
          estimated_tokens: Math.ceil(fallbackText.length / 4),
          called_at: new Date().toISOString(),
        });
      } catch {
        // 非致命的
      }

      return Response.json(
        {
          workflowId,
          outputs: { text: fallbackText },
          backend: "gemini-fallback",
        },
        { status: 200, headers: corsHeaders }
      );
    } catch (fallbackErr) {
      console.error("[dify-workflow] Gemini フォールバックも失敗:", fallbackErr);
      return Response.json(
        {
          error: `ワークフロー実行に失敗しました: ${
            fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
          }`,
        },
        { status: 500, headers: corsHeaders }
      );
    }
  }

  // ここには到達しないが安全のため
  return Response.json({ error: "予期しないエラー" }, { status: 500, headers: corsHeaders });
});
