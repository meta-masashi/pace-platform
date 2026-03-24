/**
 * PACE Platform — RAG ベクトル検索 Retriever
 *
 * pgvector の match_documents RPC を使用した類似ドキュメント検索。
 *
 * 検索精度改善ロジック（意思決定ロジック準拠）:
 *   1. 検索精度が目標を下回る場合 → match_threshold を下げる
 *   2. 改善しない場合 → match_count を増やす
 *   3. さらに改善しない場合 → ハイブリッド検索（キーワード + ベクトル）に切り替える
 */

import { embedText } from "./embedding";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface RetrievedDocument {
  id: string;
  content: string;
  similarity: number;
  source_document_id: string;
  metadata?: Record<string, unknown>;
}

export interface RetrievalOptions {
  /** 類似度閾値（0-1）。デフォルト 0.7 */
  matchThreshold?: number;
  /** 返却する最大ドキュメント数。デフォルト 5 */
  matchCount?: number;
  /** 検索対象のドキュメントカテゴリフィルター */
  category?: string;
}

// ---------------------------------------------------------------------------
// ベクトル類似検索
// ---------------------------------------------------------------------------

/**
 * クエリテキストをベクトル化し、pgvector で類似ドキュメントを検索する。
 *
 * @param queryText  検索クエリ（ユーザーの質問・フリーテキスト）
 * @param supabase   Supabase クライアントインスタンス
 * @param options    検索オプション（閾値・件数）
 */
export async function retrieveSimilarDocuments(
  queryText: string,
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{
      data: RetrievedDocument[] | null;
      error: { message: string } | null;
    }>;
  },
  options: RetrievalOptions = {}
): Promise<RetrievedDocument[]> {
  const matchThreshold = options.matchThreshold ?? 0.7;
  const matchCount = options.matchCount ?? 5;

  // クエリをベクトル化（RETRIEVAL_QUERY タイプ）
  const { vector } = await embedText(queryText, "RETRIEVAL_QUERY");

  const rpcArgs: Record<string, unknown> = {
    query_embedding: vector,
    match_threshold: matchThreshold,
    match_count: matchCount,
  };

  if (options.category) {
    rpcArgs.filter_category = options.category;
  }

  const { data, error } = await supabase.rpc("match_documents", rpcArgs);

  if (error) {
    throw new Error(`[retriever] pgvector 検索失敗: ${error.message}`);
  }

  return (data ?? []).filter((doc) => doc.similarity >= matchThreshold);
}

// ---------------------------------------------------------------------------
// 適応的検索（精度改善ロジック）
// ---------------------------------------------------------------------------

export interface AdaptiveRetrievalResult {
  documents: RetrievedDocument[];
  usedThreshold: number;
  usedMatchCount: number;
  strategy: "standard" | "relaxed_threshold" | "increased_count" | "hybrid";
}

/**
 * 段階的に検索パラメータを緩和しながら十分な結果を取得する。
 *
 * 意思決定ロジック:
 *   Step 1: 標準設定（threshold=0.7, count=5）
 *   Step 2: 閾値を下げる（threshold=0.6）
 *   Step 3: 件数を増やす（count=10）
 *   Step 4: ハイブリッド検索（フルテキスト + ベクトル）
 *
 * @param minRequiredDocs 必要な最小ドキュメント数（デフォルト: 2）
 */
export async function retrieveWithAdaptiveStrategy(
  queryText: string,
  supabase: Parameters<typeof retrieveSimilarDocuments>[1] & {
    from: (table: string) => {
      select: (cols: string) => {
        textSearch: (col: string, query: string, opts?: Record<string, unknown>) => Promise<{
          data: Array<{ id: string; content: string; source_document_id: string }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  },
  minRequiredDocs = 2,
  category?: string
): Promise<AdaptiveRetrievalResult> {
  // Step 1: 標準設定
  const step1 = await retrieveSimilarDocuments(queryText, supabase, {
    matchThreshold: 0.7,
    matchCount: 5,
    ...(category !== undefined && { category }),
  });

  if (step1.length >= minRequiredDocs) {
    return {
      documents: step1,
      usedThreshold: 0.7,
      usedMatchCount: 5,
      strategy: "standard",
    };
  }

  console.info(`[retriever] Step 1 結果不足(${step1.length}件) → 閾値を緩和`);

  // Step 2: 閾値を下げる
  const step2 = await retrieveSimilarDocuments(queryText, supabase, {
    matchThreshold: 0.6,
    matchCount: 5,
    ...(category !== undefined && { category }),
  });

  if (step2.length >= minRequiredDocs) {
    return {
      documents: step2,
      usedThreshold: 0.6,
      usedMatchCount: 5,
      strategy: "relaxed_threshold",
    };
  }

  console.info(`[retriever] Step 2 結果不足(${step2.length}件) → 件数を増加`);

  // Step 3: 件数を増やす
  const step3 = await retrieveSimilarDocuments(queryText, supabase, {
    matchThreshold: 0.6,
    matchCount: 10,
    ...(category !== undefined && { category }),
  });

  if (step3.length >= minRequiredDocs) {
    return {
      documents: step3,
      usedThreshold: 0.6,
      usedMatchCount: 10,
      strategy: "increased_count",
    };
  }

  console.info(`[retriever] Step 3 結果不足(${step3.length}件) → ハイブリッド検索`);

  // Step 4: ハイブリッド検索（フルテキスト + ベクトル融合）
  const hybridDocs = await hybridSearch(queryText, supabase, step3, category);
  return {
    documents: hybridDocs,
    usedThreshold: 0.6,
    usedMatchCount: 10,
    strategy: "hybrid",
  };
}

// ---------------------------------------------------------------------------
// ハイブリッド検索（キーワード + ベクトル）
// ---------------------------------------------------------------------------

/**
 * Postgres の全文検索と pgvector を組み合わせたハイブリッド検索。
 * ベクトル検索の結果にキーワードマッチ結果をマージする。
 */
async function hybridSearch(
  queryText: string,
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        textSearch: (col: string, query: string, opts?: Record<string, unknown>) => Promise<{
          data: Array<{ id: string; content: string; source_document_id: string }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  },
  vectorResults: RetrievedDocument[],
  _category?: string
): Promise<RetrievedDocument[]> {
  // Postgres 全文検索用のクエリワード抽出（シンプルな分かち書き）
  const keywords = queryText
    .replace(/[、。！？「」]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 5)
    .join(" | ");

  try {
    const { data: ftsDocs } = await supabase
      .from("document_chunks")
      .select("id, content, source_document_id")
      .textSearch("content", keywords, { type: "websearch" });

    if (!ftsDocs || ftsDocs.length === 0) return vectorResults;

    // ベクトル結果の ID セット
    const vectorIds = new Set(vectorResults.map((d) => d.id));

    // キーワードマッチ結果をマージ（重複排除、similarity=0.5 として扱う）
    const merged: RetrievedDocument[] = [...vectorResults];
    for (const ftsDoc of ftsDocs) {
      if (!vectorIds.has(ftsDoc.id)) {
        merged.push({
          id: ftsDoc.id,
          content: ftsDoc.content,
          similarity: 0.5,
          source_document_id: ftsDoc.source_document_id,
        });
      }
    }

    // 類似度の降順にソート
    return merged.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
  } catch (err) {
    console.warn("[retriever] ハイブリッド検索フォールバック失敗:", err);
    return vectorResults;
  }
}
