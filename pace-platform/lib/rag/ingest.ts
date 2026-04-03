/**
 * PACE Platform — ドキュメント取り込みパイプライン（Ingest）
 *
 * PDF / テキスト文書を受け取り:
 *   1. チャンク分割（1000文字 / 200文字オーバーラップ）
 *   2. Gemini text-embedding-004（768次元）でベクトル化
 *   3. Supabase `document_embeddings` テーブルに upsert
 *   4. バッチ処理（50件ずつ）でレート制限対応
 *
 * 防壁3: バッチ間インターバルでレート制限対応
 * 防壁4: 指数バックオフ付きリトライ
 */

import { splitTextIntoChunks, embedText } from "./embedding";
import { sanitizeUserInput } from "../shared/security-helpers";
import { createLogger } from '@/lib/observability/logger';
const log = createLogger('rag');

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface IngestSource {
  /** ソースドキュメントの一意 ID（document_sources テーブルの主キー）*/
  documentId: string;
  /** ドキュメントの全文テキスト（PDF のテキスト抽出済みのもの）*/
  text: string;
  /** ドキュメントのカテゴリ（例: "exercise", "protocol", "guideline"）*/
  category?: string;
  /** 任意メタデータ（タイトル・著者・URL等）*/
  metadata?: Record<string, unknown>;
}

export interface IngestOptions {
  /** チャンクサイズ（文字数）。デフォルト 1000 */
  chunkSize?: number;
  /** オーバーラップ（文字数）。デフォルト 200 */
  overlap?: number;
  /** バッチサイズ（件数）。デフォルト 50 */
  batchSize?: number;
  /** バッチ間スリープ（ms）。デフォルト 1000ms — レート制限対応（防壁3）*/
  batchIntervalMs?: number;
}

export interface IngestResult {
  documentId: string;
  totalChunks: number;
  upsertedChunks: number;
  failedChunks: number;
  processingTimeMs: number;
}

// Supabase クライアント最小型定義
type SupabaseUpsertClient = {
  from: (table: string) => {
    upsert: (
      data: unknown,
      opts?: { onConflict?: string }
    ) => Promise<{ error: { message: string } | null }>;
  };
};

// ---------------------------------------------------------------------------
// メイン取り込み関数
// ---------------------------------------------------------------------------

/**
 * 単一ドキュメントを取り込み、`document_embeddings` テーブルに upsert する。
 *
 * @param source    取り込み対象のドキュメント
 * @param supabase  Supabase クライアントインスタンス
 * @param options   チャンク・バッチ設定
 */
export async function ingestDocument(
  source: IngestSource,
  supabase: SupabaseUpsertClient,
  options: IngestOptions = {}
): Promise<IngestResult> {
  const {
    chunkSize = 1_000,
    overlap = 200,
    batchSize = 50,
    batchIntervalMs = 1_000,
  } = options;

  const startTime = Date.now();
  const { documentId, text, category, metadata } = source;

  // 入力テキストのサニタイズ（XSSおよびインジェクション対策）
  const sanitizedText = sanitizeUserInput(text);

  // ステップ1: チャンク分割
  const chunks = splitTextIntoChunks(sanitizedText, { chunkSize, overlap });
  log.info(`ドキュメント ${documentId}: ${chunks.length} チャンクに分割`);

  let upsertedChunks = 0;
  let failedChunks = 0;

  // ステップ2-3: バッチ処理（50件ずつ）
  for (let batchStart = 0; batchStart < chunks.length; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, chunks.length);
    const batch = chunks.slice(batchStart, batchEnd);

    // バッチ内を並列 Embedding（ただし Gemini API の同時リクエスト上限に配慮）
    const embeddingResults = await Promise.allSettled(
      batch.map((chunk, localIdx) =>
        embedText(chunk, "RETRIEVAL_DOCUMENT").then((result) => ({
          chunkIndex: batchStart + localIdx,
          chunk,
          vector: result.vector,
        }))
      )
    );

    // upsert レコードを組み立て
    const records: Array<{
      document_id: string;
      chunk_index: number;
      content: string;
      embedding: string;
      category: string | null;
      metadata: Record<string, unknown>;
      updated_at: string;
    }> = [];

    for (const settled of embeddingResults) {
      if (settled.status === "rejected") {
        log.errorFromException('Embedding 失敗', settled.reason);
        failedChunks++;
        continue;
      }

      const { chunkIndex, chunk, vector } = settled.value;
      records.push({
        document_id: documentId,
        chunk_index: chunkIndex,
        content: chunk,
        // pgvector 形式: `[x1,x2,...,xN]`
        embedding: `[${vector.join(",")}]`,
        category: category ?? null,
        metadata: metadata ?? {},
        updated_at: new Date().toISOString(),
      });
    }

    // Supabase upsert（chunk_index + document_id の複合キーで冪等性を保証）
    if (records.length > 0) {
      const { error } = await supabase
        .from("document_embeddings")
        .upsert(records, { onConflict: "document_id,chunk_index" });

      if (error) {
        log.error(`バッチ upsert 失敗 (chunks ${batchStart}-${batchEnd - 1})`, { data: { error: error.message } });
        failedChunks += records.length;
      } else {
        upsertedChunks += records.length;
        log.info(`バッチ upsert 完了: ${records.length} 件 (${batchStart + 1}-${batchEnd}/${chunks.length})`);
      }
    }

    // バッチ間スリープ（レート制限対応 — 防壁3）
    if (batchEnd < chunks.length) {
      await new Promise((r) => setTimeout(r, batchIntervalMs));
    }
  }

  const processingTimeMs = Date.now() - startTime;
  log.info(`完了: documentId=${documentId} upserted=${upsertedChunks} failed=${failedChunks}`, { duration: processingTimeMs });

  return {
    documentId,
    totalChunks: chunks.length,
    upsertedChunks,
    failedChunks,
    processingTimeMs,
  };
}

// ---------------------------------------------------------------------------
// 複数ドキュメント一括取り込み
// ---------------------------------------------------------------------------

export interface BulkIngestResult {
  succeeded: IngestResult[];
  failed: Array<{ documentId: string; error: string }>;
  totalProcessingTimeMs: number;
}

/**
 * 複数ドキュメントを順次取り込む。
 * 1ドキュメント失敗しても後続のドキュメントは継続処理する。
 *
 * @param sources   取り込み対象ドキュメントの配列
 * @param supabase  Supabase クライアント
 * @param options   チャンク・バッチ設定
 */
export async function ingestDocuments(
  sources: IngestSource[],
  supabase: SupabaseUpsertClient,
  options: IngestOptions = {}
): Promise<BulkIngestResult> {
  const startTime = Date.now();
  const succeeded: IngestResult[] = [];
  const failed: Array<{ documentId: string; error: string }> = [];

  for (const source of sources) {
    try {
      const result = await ingestDocument(source, supabase, options);
      succeeded.push(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error(`ドキュメント ${source.documentId} 取り込み失敗`, { data: { error: errorMessage } });
      failed.push({ documentId: source.documentId, error: errorMessage });
    }
  }

  return {
    succeeded,
    failed,
    totalProcessingTimeMs: Date.now() - startTime,
  };
}
