/**
 * Supabase Edge Function — embed-documents
 * ============================================================
 * HTTP エンドポイントとして動作し、ドキュメントの埋め込みベクトル化を実行する。
 * pace-platform/lib/rag/ingest.ts の ingestDocument() を呼び出す Deno ラッパー。
 *
 * リクエスト形式 (POST /functions/v1/embed-documents):
 * {
 *   "documentId": "doc_xxx",
 *   "text": "埋め込み対象のテキスト...",
 *   "category": "exercise",       // オプション
 *   "metadata": { "title": "..." } // オプション
 * }
 *
 * 認証: Authorization: Bearer <SUPABASE_ANON_KEY> または SERVICE_ROLE_KEY
 *
 * 【防壁1】サービスロールキーで Supabase に書き込み
 * 【防壁2】入力サニタイズは ingest.ts 内で実施
 * 【防壁3】バッチ処理・レート制限は ingest.ts 内で制御
 * 【防壁4】エラー時は 500 + エラーメッセージを返す
 * ============================================================
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface EmbedRequest {
  documentId: string;
  text: string;
  category?: string;
  metadata?: Record<string, unknown>;
  chunkSize?: number;
  overlap?: number;
}

interface EmbedResponse {
  success: boolean;
  documentId: string;
  chunksProcessed?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Gemini Embedding 呼び出し（Deno 環境でのネイティブ実装）
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
    throw new Error(`Gemini Embedding API HTTP ${response.status}: ${body}`);
  }

  const data = await response.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Gemini Embedding: embedding.values が空です");
  }
  return values as number[];
}

// ---------------------------------------------------------------------------
// テキストをチャンク分割
// ---------------------------------------------------------------------------

function splitIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// メインハンドラー
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  // 【防壁1】CORS: 許可オリジンを NEXT_PUBLIC_SITE_URL に限定（全開放禁止）
  const allowedOrigin = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    // origin が一致する場合のみ反射。空文字列の場合は拒否
    ...(allowedOrigin && origin === allowedOrigin
      ? { "Access-Control-Allow-Origin": allowedOrigin }
      : {}),
  };

  // CORS プリフライト対応
  if (req.method === "OPTIONS") {
    if (!allowedOrigin || origin !== allowedOrigin) {
      return new Response("Forbidden", { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "POST のみ受け付けます" }, { status: 405 });
  }

  // 【防壁1】認証チェック: Supabase JWT 検証（未認証リクエストを 401 で拒否）
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey) {
    return Response.json({ error: "Supabase 環境変数が未設定です" }, { status: 500 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  // Service Role キーでの呼び出しは内部サービスのみ許可（それ以外は JWT 検証）
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
  if (!isServiceRole) {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Supabase Admin クライアント初期化（書き込みは Service Role で実行）

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { error: "Supabase 環境変数が未設定です" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let body: EmbedRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "リクエストボディが無効なJSONです" }, { status: 400 });
  }

  const {
    documentId,
    text,
    category,
    metadata,
    chunkSize: rawChunkSize = 1000,
    overlap: rawOverlap = 200,
  } = body;

  if (!documentId || !text) {
    return Response.json(
      { error: "documentId と text は必須です" },
      { status: 400 }
    );
  }

  if (typeof text !== "string" || text.trim().length === 0) {
    return Response.json({ error: "text が空です" }, { status: 400 });
  }

  // 【防壁5】chunkSize / overlap の範囲バリデーション（OOM / 無限ループ防止）
  const chunkSize = Math.max(100, Math.min(5000, Number(rawChunkSize) || 1000));
  const overlap = Math.max(0, Math.min(Math.floor(chunkSize / 2), Number(rawOverlap) || 200));

  // チャンク分割
  const chunks = splitIntoChunks(text.trim(), chunkSize, overlap);

  // 各チャンクを埋め込みベクトル化してバッチ upsert
  const BATCH_SIZE = 50;
  const BATCH_INTERVAL_MS = 1000;
  let processedCount = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const rows: Array<{
      document_id: string;
      chunk_index: number;
      content: string;
      embedding: number[];
      category: string | null;
      metadata: Record<string, unknown>;
    }> = [];

    for (let j = 0; j < batch.length; j++) {
      const chunkIndex = i + j;
      const chunkText = batch[j];

      // 指数バックオフ付きリトライ（最大3回）
      let embedding: number[] | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          embedding = await embedText(chunkText);
          break;
        } catch (err) {
          if (attempt === 2) throw err;
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }

      if (!embedding) throw new Error(`チャンク ${chunkIndex} の埋め込みに失敗しました`);

      rows.push({
        document_id: documentId,
        chunk_index: chunkIndex,
        content: chunkText,
        embedding,
        category: category ?? null,
        metadata: metadata ?? {},
      });
    }

    // バッチ upsert（document_id + chunk_index が複合ユニークキー）
    const { error: upsertError } = await supabase
      .from("document_embeddings")
      .upsert(rows, { onConflict: "document_id,chunk_index" });

    if (upsertError) {
      console.error("[embed-documents] upsert エラー:", upsertError.message);
      return Response.json(
        { success: false, documentId, error: upsertError.message },
        { status: 500 }
      );
    }

    processedCount += rows.length;

    // バッチ間スリープ（レート制限対応）
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise((r) => setTimeout(r, BATCH_INTERVAL_MS));
    }
  }

  const result: EmbedResponse = {
    success: true,
    documentId,
    chunksProcessed: processedCount,
  };

  console.info(
    `[embed-documents] 完了: documentId=${documentId} chunks=${processedCount}`
  );

  return Response.json(result, { status: 200 });
});
