/**
 * PACE Platform — RAGドキュメント Embedding
 *
 * Gemini text-embedding-004 を使用して:
 *   - テキストを 768 次元ベクトルに変換
 *   - チャンク分割（固定長 + オーバーラップ）
 *   - Supabase document_chunks テーブルへの保存
 *
 * 防壁4: JSONパース失敗時の指数バックオフ付きリトライ
 */

// ---------------------------------------------------------------------------
// チャンク分割
// ---------------------------------------------------------------------------

export interface ChunkOptions {
  /** チャンクサイズ（文字数）。デフォルト 1000 */
  chunkSize?: number;
  /** オーバーラップ（文字数）。デフォルト 200 */
  overlap?: number;
}

/**
 * テキストを固定長チャンクに分割する（末尾オーバーラップあり）。
 *
 * @param text      分割対象テキスト
 * @param options   チャンクサイズ・オーバーラップ設定
 * @returns チャンク文字列の配列
 */
export function splitTextIntoChunks(text: string, options: ChunkOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? 1_000;
  const overlap = options.overlap ?? 200;

  if (chunkSize <= overlap) {
    throw new Error(`chunkSize(${chunkSize}) は overlap(${overlap}) より大きくしてください`);
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    if (end === text.length) break;
    start += chunkSize - overlap;
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Embedding API（Gemini text-embedding-004）
// ---------------------------------------------------------------------------

const EMBEDDING_MODEL = "text-embedding-004";
const EMBEDDING_DIMENSIONS = 768;
const MAX_EMBED_RETRIES = 3;

export interface EmbedResult {
  vector: number[];
  dimensions: number;
}

/**
 * テキストを Gemini text-embedding-004 でベクトル化する。
 * 指数バックオフ付きリトライ実装（防壁4）。
 *
 * @param text      埋め込み対象テキスト
 * @param taskType  "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"
 */
export async function embedText(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT"
): Promise<EmbedResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_EMBED_RETRIES; attempt++) {
    // 指数バックオフ（防壁4）
    if (attempt > 0) {
      const delay = Math.pow(2, attempt - 1) * 1_000;
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
            taskType,
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`Embedding API Error: ${response.status} ${errorBody}`);
      }

      const data = await response.json() as { embedding?: { values?: number[] } };
      const values: number[] = data?.embedding?.values ?? [];

      if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `予期しない Embedding 形式: dimensions=${values?.length ?? "undefined"}`
        );
      }

      return { vector: values, dimensions: EMBEDDING_DIMENSIONS };
    } catch (err) {
      lastError = err;
      console.warn(`[embedding] attempt ${attempt + 1}/${MAX_EMBED_RETRIES} 失敗:`, err);
    }
  }

  throw new Error(`[embedding] 全リトライ失敗: ${lastError}`);
}

// ---------------------------------------------------------------------------
// バルク埋め込み（ドキュメント保存）
// ---------------------------------------------------------------------------

export interface DocumentChunk {
  content: string;
  embedding: number[];
  chunk_index: number;
  source_document_id: string;
  metadata?: Record<string, unknown>;
}

/**
 * ドキュメントをチャンク分割して Embedding を生成し、Supabase に保存する。
 *
 * @param documentId  ソースドキュメントの ID（document_sources テーブル）
 * @param text        ドキュメントの全文
 * @param supabase    Supabase クライアントインスタンス
 * @param options     チャンクオプション
 * @returns 保存されたチャンク数
 */
export async function embedAndStoreDocument(
  documentId: string,
  text: string,
  supabase: {
    from: (table: string) => {
      insert: (data: unknown) => Promise<{ error: { message: string } | null }>;
    };
  },
  options: ChunkOptions = {}
): Promise<number> {
  const chunks = splitTextIntoChunks(text, options);
  console.info(`[embedding] ドキュメント ${documentId}: ${chunks.length} チャンクに分割`);

  let savedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i] ?? "";

    // テキストを埋め込み
    const { vector } = await embedText(chunk, "RETRIEVAL_DOCUMENT");

    // Supabase に保存
    const { error } = await supabase.from("document_chunks").insert({
      source_document_id: documentId,
      content: chunk,
      embedding: JSON.stringify(vector), // pgvector 形式
      chunk_index: i,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error(`[embedding] チャンク ${i} 保存失敗:`, error.message);
      // 非致命的エラー — 残りのチャンクは継続して保存
      continue;
    }

    savedCount++;
  }

  console.info(`[embedding] ${savedCount}/${chunks.length} チャンク保存完了`);
  return savedCount;
}
