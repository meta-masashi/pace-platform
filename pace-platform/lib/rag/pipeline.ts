/**
 * PACE Platform — RAG パイプライン統合
 *
 * Retrieve → Augment → Generate の3段階パイプライン。
 *
 * 使用シーン:
 *   - スポーツ医学ナレッジベースへの問い合わせ
 *   - プロトコル・ガイドライン検索
 *   - エクサ サイズDB からの運動処方候補検索
 */

import { retrieveWithAdaptiveStrategy, type RetrievedDocument } from "./retriever";
import { callGeminiWithRetry, buildCdsSystemPrefix, MEDICAL_DISCLAIMER, type GeminiCallContext } from "../gemini/client";
import { sanitizeUserInput, detectInjectionAttempt } from "../shared/security-helpers";
import { createLogger } from '@/lib/observability/logger';
const log = createLogger('rag');

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface RagQueryInput {
  /** ユーザーの質問（サニタイズ前でよい）*/
  query: string;
  /** 検索カテゴリフィルター（例: "exercise", "protocol", "guideline"）*/
  category?: string;
  /** 追加コンテキスト（アスリートのプロファイル等）*/
  additionalContext?: string;
  staffContext: GeminiCallContext;
}

export interface RagQueryResult {
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
// RAG パイプライン
// ---------------------------------------------------------------------------

/**
 * Retrieve → Augment → Generate パイプラインを実行する。
 *
 * @param input    クエリと設定
 * @param supabase Supabase クライアント
 */
export async function runRagPipeline(
  input: RagQueryInput,
  supabase: Parameters<typeof retrieveWithAdaptiveStrategy>[1]
): Promise<RagQueryResult> {
  const { query, category, additionalContext, staffContext } = input;

  // プロンプトインジェクション検出（防壁2）
  const injectionDetected = detectInjectionAttempt(query);
  if (injectionDetected) {
    log.warn('プロンプトインジェクション検出', { userId: staffContext.userId });
    return {
      answer: "不適切な入力を検出しました。質問の内容を変更してお試しください。",
      sourceDocuments: [],
      retrievalStrategy: "blocked",
      disclaimer: MEDICAL_DISCLAIMER,
      injectionDetected: true,
    };
  }

  // Step 1: ユーザークエリのサニタイズ
  const sanitizedQuery = sanitizeUserInput(query);

  // Step 2: 適応的ベクトル検索（Retrieve）
  let retrievalResult;
  try {
    retrievalResult = await retrieveWithAdaptiveStrategy(
      sanitizedQuery,
      supabase,
      2, // 最低 2 件のドキュメントを要求
      category
    );
  } catch (err) {
    log.errorFromException('ベクトル検索失敗', err);
    throw new Error(`RAG 検索エラー: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }

  const { documents, strategy } = retrievalResult;

  // 関連ドキュメントが見つからない場合
  if (documents.length === 0) {
    return {
      answer: "関連する情報が見つかりませんでした。質問の表現を変えてお試しください。",
      sourceDocuments: [],
      retrievalStrategy: strategy,
      disclaimer: MEDICAL_DISCLAIMER,
      injectionDetected: false,
    };
  }

  // Step 3: コンテキスト組み立て（Augment）
  const context = buildRagContext(documents);

  // Step 4: プロンプト構築
  const systemPrefix = buildCdsSystemPrefix();
  const prompt = buildRagPrompt(systemPrefix, context, sanitizedQuery, additionalContext);

  // Step 5: Gemini で回答生成（Generate）
  const { result: answer } = await callGeminiWithRetry(
    prompt,
    (text) => text.trim(),
    staffContext
  );

  return {
    answer,
    sourceDocuments: documents.map((d) => ({
      id: d.id,
      content: d.content.slice(0, 200) + (d.content.length > 200 ? "..." : ""),
      similarity: d.similarity,
    })),
    retrievalStrategy: strategy,
    disclaimer: MEDICAL_DISCLAIMER,
    injectionDetected: false,
  };
}

// ---------------------------------------------------------------------------
// プライベートヘルパー
// ---------------------------------------------------------------------------

function buildRagContext(documents: RetrievedDocument[]): string {
  return documents
    .map(
      (doc, i) =>
        `[参考資料 ${i + 1}] (類似度: ${(doc.similarity * 100).toFixed(0)}%)\n${doc.content}`
    )
    .join("\n\n---\n\n");
}

function buildRagPrompt(
  systemPrefix: string,
  context: string,
  query: string,
  additionalContext?: string
): string {
  const additionalSection = additionalContext
    ? `\n=== 追加コンテキスト ===\n${additionalContext}\n`
    : "";

  return `${systemPrefix}
以下の参考資料に基づいて、スポーツ医学の観点から日本語で回答してください。
参考資料に記載されていない情報は「その情報は持ち合わせていません」と正直に答えてください。
回答は具体的かつ実践的にしてください。

=== 参考資料 ===
${context}
=== 参考資料ここまで ===
${additionalSection}
質問: ${query}

回答:`;
}
