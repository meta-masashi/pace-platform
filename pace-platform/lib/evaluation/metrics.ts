/**
 * PACE Platform — AI精度評価フレームワーク
 *
 * 評価指標:
 *   RAG検索精度:   Precision@K, Recall@K, MRR（Mean Reciprocal Rank）
 *   ベイズ推論精度: AUROC, 感度（Sensitivity）, 特異度（Specificity）
 *   LLM出力品質:   BERTScore近似（コサイン類似度ベース）
 *
 * 評価結果は Supabase `evaluation_runs` テーブルに保存する。
 */

import { embedText } from "../rag/embedding";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** RAG 検索の評価ケース */
export interface RagEvalCase {
  caseId: string;
  query: string;
  /** 正解ドキュメント ID の集合（部分一致）*/
  relevantDocIds: string[];
  /** 評価タグ（カテゴリ・難易度等）*/
  tags?: string[];
}

/** RAG 検索結果（被評価対象）*/
export interface RagSearchResult {
  caseId: string;
  retrievedDocIds: string[];
  /** 各ドキュメントの類似度スコア */
  scores?: number[];
}

/** ベイズ推論の評価ケース */
export interface BayesEvalCase {
  caseId: string;
  /** 真の診断ラベル */
  trueLabel: string;
  /** 予測スコア（0-1）*/
  predictedScore: number;
  /** 二値分類ラベル（1=陽性, 0=陰性）*/
  trueLabel01: 0 | 1;
  tags?: string[];
}

/** LLM 出力品質の評価ケース */
export interface LlmQualityCase {
  caseId: string;
  /** 参照回答（ゴールドスタンダード）*/
  referenceText: string;
  /** LLM が生成した回答 */
  generatedText: string;
  tags?: string[];
}

/** 評価実行全体の結果 */
export interface EvaluationRunResult {
  runId: string;
  evaluationType: "rag" | "bayes" | "llm_quality" | "composite";
  startedAt: string;
  completedAt: string;
  metrics: EvaluationMetrics;
  caseResults: Array<{
    caseId: string;
    passed: boolean;
    score: number;
    detail: Record<string, unknown>;
  }>;
  metadata?: Record<string, unknown>;
}

export interface EvaluationMetrics {
  // RAG 指標
  precisionAtK?: number;
  recallAtK?: number;
  mrr?: number;
  // ベイズ推論指標
  auroc?: number;
  sensitivity?: number;
  specificity?: number;
  // LLM 品質指標
  avgCosineSimilarity?: number;
  bertScoreApprox?: number;
  // 総合
  overallPassRate?: number;
}

// ---------------------------------------------------------------------------
// RAG 評価指標
// ---------------------------------------------------------------------------

/**
 * Precision@K を計算する。
 * K 件の検索結果のうち、正解ドキュメントが含まれる割合。
 *
 * @param retrievedIds  取得されたドキュメント ID（順序あり）
 * @param relevantIds   正解ドキュメント ID の集合
 * @param k             評価対象の上位 K 件
 */
export function precisionAtK(
  retrievedIds: string[],
  relevantIds: string[],
  k: number
): number {
  const topK = retrievedIds.slice(0, k);
  const relevantSet = new Set(relevantIds);
  const hits = topK.filter((id) => relevantSet.has(id)).length;
  return hits / k;
}

/**
 * Recall@K を計算する。
 * 正解ドキュメントのうち、上位 K 件に含まれる割合。
 *
 * @param retrievedIds  取得されたドキュメント ID
 * @param relevantIds   正解ドキュメント ID の集合
 * @param k             評価対象の上位 K 件
 */
export function recallAtK(
  retrievedIds: string[],
  relevantIds: string[],
  k: number
): number {
  if (relevantIds.length === 0) return 0;
  const topK = new Set(retrievedIds.slice(0, k));
  const hits = relevantIds.filter((id) => topK.has(id)).length;
  return hits / relevantIds.length;
}

/**
 * Reciprocal Rank を計算する。
 * 最初の正解ドキュメントのランク（1-indexed）の逆数。
 */
function reciprocalRank(retrievedIds: string[], relevantIds: string[]): number {
  const relevantSet = new Set(relevantIds);
  for (let i = 0; i < retrievedIds.length; i++) {
    if (relevantSet.has(retrievedIds[i]!)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * MRR（Mean Reciprocal Rank）を計算する。
 * 全ケースの Reciprocal Rank の平均値。
 *
 * @param cases    RAG 評価ケースのリスト
 * @param results  対応する検索結果のリスト
 */
export function computeMrr(
  cases: RagEvalCase[],
  results: RagSearchResult[]
): number {
  if (cases.length === 0) return 0;

  const resultMap = new Map(results.map((r) => [r.caseId, r]));
  const rrs = cases.map((c) => {
    const result = resultMap.get(c.caseId);
    if (!result) return 0;
    return reciprocalRank(result.retrievedDocIds, c.relevantDocIds);
  });

  return rrs.reduce((sum, rr) => sum + rr, 0) / cases.length;
}

/**
 * RAG 評価指標を一括計算する。
 *
 * @param cases    評価ケース
 * @param results  検索結果
 * @param k        Precision@K / Recall@K の K 値
 */
export function evaluateRag(
  cases: RagEvalCase[],
  results: RagSearchResult[],
  k = 5
): { precisionAtK: number; recallAtK: number; mrr: number } {
  if (cases.length === 0) {
    return { precisionAtK: 0, recallAtK: 0, mrr: 0 };
  }

  const resultMap = new Map(results.map((r) => [r.caseId, r]));

  let totalPrecision = 0;
  let totalRecall = 0;

  for (const c of cases) {
    const result = resultMap.get(c.caseId);
    if (!result) continue;
    totalPrecision += precisionAtK(result.retrievedDocIds, c.relevantDocIds, k);
    totalRecall += recallAtK(result.retrievedDocIds, c.relevantDocIds, k);
  }

  return {
    precisionAtK: totalPrecision / cases.length,
    recallAtK: totalRecall / cases.length,
    mrr: computeMrr(cases, results),
  };
}

// ---------------------------------------------------------------------------
// ベイズ推論評価指標（AUROC / 感度 / 特異度）
// ---------------------------------------------------------------------------

/**
 * AUROC（ROC 曲線下面積）を計算する（台形法）。
 *
 * @param cases  ベイズ評価ケース（trueLabel01 + predictedScore が必要）
 */
export function computeAuroc(cases: BayesEvalCase[]): number {
  if (cases.length === 0) return 0;

  // スコアの降順にソート
  const sorted = [...cases].sort((a, b) => b.predictedScore - a.predictedScore);

  const positives = cases.filter((c) => c.trueLabel01 === 1).length;
  const negatives = cases.filter((c) => c.trueLabel01 === 0).length;

  if (positives === 0 || negatives === 0) return 0.5; // 退化ケース

  let auc = 0;
  let tpCount = 0;
  let fpCount = 0;
  let prevTp = 0;
  let prevFp = 0;

  for (const item of sorted) {
    if (item.trueLabel01 === 1) {
      tpCount++;
    } else {
      fpCount++;
      // 台形面積を加算
      auc += ((tpCount + prevTp) / 2) * (1 / negatives);
    }
    prevTp = tpCount;
    prevFp = fpCount;
  }

  // TPR / FPR で正規化
  return auc / positives;
}

/**
 * 感度（Sensitivity / Recall）と特異度（Specificity）を計算する。
 *
 * @param cases      評価ケース
 * @param threshold  二値分類の閾値（デフォルト: 0.5）
 */
export function computeSensitivitySpecificity(
  cases: BayesEvalCase[],
  threshold = 0.5
): { sensitivity: number; specificity: number } {
  let tp = 0, tn = 0, fp = 0, fn = 0;

  for (const c of cases) {
    const predicted = c.predictedScore >= threshold ? 1 : 0;
    if (c.trueLabel01 === 1 && predicted === 1) tp++;
    else if (c.trueLabel01 === 0 && predicted === 0) tn++;
    else if (c.trueLabel01 === 0 && predicted === 1) fp++;
    else fn++;
  }

  const sensitivity = tp + fn > 0 ? tp / (tp + fn) : 0;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;

  return { sensitivity, specificity };
}

// ---------------------------------------------------------------------------
// LLM 出力品質評価（BERTScore 近似）
// ---------------------------------------------------------------------------

/**
 * コサイン類似度を計算する。
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dot += (vecA[i] ?? 0) * (vecB[i] ?? 0);
    normA += (vecA[i] ?? 0) ** 2;
    normB += (vecB[i] ?? 0) ** 2;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

/**
 * BERTScore 近似値を計算する（Gemini Embedding ベース）。
 *
 * 参照テキストと生成テキストをそれぞれ Embedding し、
 * コサイン類似度を BERTScore の近似値として使用する。
 *
 * @param referenceText  参照回答（ゴールドスタンダード）
 * @param generatedText  LLM 生成回答
 * @returns コサイン類似度（0-1）
 */
export async function computeBertScoreApprox(
  referenceText: string,
  generatedText: string
): Promise<number> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.warn("[evaluation:metrics] GEMINI_API_KEY 未設定 — BERTScore 計算をスキップ");
    return 0;
  }

  const [refEmbed, genEmbed] = await Promise.all([
    embedText(referenceText, "RETRIEVAL_DOCUMENT"),
    embedText(generatedText, "RETRIEVAL_DOCUMENT"),
  ]);

  return cosineSimilarity(refEmbed.vector, genEmbed.vector);
}

/**
 * 複数の LLM 出力ケースの BERTScore 近似値を一括計算する。
 */
export async function evaluateLlmQuality(
  cases: LlmQualityCase[]
): Promise<{ avgCosineSimilarity: number; caseScores: Array<{ caseId: string; score: number }> }> {
  if (cases.length === 0) {
    return { avgCosineSimilarity: 0, caseScores: [] };
  }

  const caseScores: Array<{ caseId: string; score: number }> = [];
  let totalScore = 0;

  for (const c of cases) {
    const score = await computeBertScoreApprox(c.referenceText, c.generatedText);
    caseScores.push({ caseId: c.caseId, score });
    totalScore += score;
  }

  return {
    avgCosineSimilarity: totalScore / cases.length,
    caseScores,
  };
}

// ---------------------------------------------------------------------------
// 評価レポート保存
// ---------------------------------------------------------------------------

type SupabaseInsertClient = {
  from: (table: string) => {
    insert: (
      data: unknown
    ) => Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }>;
  };
};

/**
 * 評価実行結果を Supabase `evaluation_runs` テーブルに保存する。
 *
 * @param runResult  評価結果
 * @param supabase   Supabase クライアント
 * @returns 保存されたレコードの ID
 */
export async function saveEvaluationRun(
  runResult: EvaluationRunResult,
  supabase: SupabaseInsertClient
): Promise<string> {
  const { data, error } = await supabase.from("evaluation_runs").insert({
    run_id: runResult.runId,
    evaluation_type: runResult.evaluationType,
    started_at: runResult.startedAt,
    completed_at: runResult.completedAt,
    metrics: runResult.metrics,
    case_results: runResult.caseResults,
    metadata: runResult.metadata ?? {},
  });

  if (error) {
    throw new Error(`[evaluation:metrics] 評価結果保存失敗: ${error.message}`);
  }

  const savedId = data?.[0]?.id;
  if (!savedId) {
    throw new Error("[evaluation:metrics] 保存されたレコードの ID が取得できません");
  }

  console.info(`[evaluation:metrics] 評価結果保存完了: id=${savedId} type=${runResult.evaluationType}`);
  return savedId;
}

// ---------------------------------------------------------------------------
// 統合評価ランナー
// ---------------------------------------------------------------------------

export interface CompositeEvalInput {
  runId?: string;
  ragCases?: { cases: RagEvalCase[]; results: RagSearchResult[]; k?: number };
  bayesCases?: BayesEvalCase[];
  llmCases?: LlmQualityCase[];
  metadata?: Record<string, unknown>;
}

/**
 * RAG / ベイズ / LLM 品質の複合評価を実行し、Supabase に保存する。
 *
 * @param input    評価入力
 * @param supabase Supabase クライアント
 */
export async function runCompositeEvaluation(
  input: CompositeEvalInput,
  supabase: SupabaseInsertClient
): Promise<EvaluationRunResult> {
  const startedAt = new Date().toISOString();
  const runId = input.runId ?? `eval_${Date.now()}`;
  const metrics: EvaluationMetrics = {};
  const allCaseResults: EvaluationRunResult["caseResults"] = [];

  // RAG 評価
  if (input.ragCases && input.ragCases.cases.length > 0) {
    const { cases, results, k = 5 } = input.ragCases;
    const ragMetrics = evaluateRag(cases, results, k);
    metrics.precisionAtK = ragMetrics.precisionAtK;
    metrics.recallAtK = ragMetrics.recallAtK;
    metrics.mrr = ragMetrics.mrr;

    const resultMap = new Map(results.map((r) => [r.caseId, r]));
    for (const c of cases) {
      const result = resultMap.get(c.caseId);
      const p = result ? precisionAtK(result.retrievedDocIds, c.relevantDocIds, k) : 0;
      const r = result ? recallAtK(result.retrievedDocIds, c.relevantDocIds, k) : 0;
      allCaseResults.push({
        caseId: c.caseId,
        passed: p > 0,
        score: (p + r) / 2,
        detail: { precision: p, recall: r },
      });
    }

    console.info(
      `[evaluation] RAG: P@${k}=${ragMetrics.precisionAtK.toFixed(3)} R@${k}=${ragMetrics.recallAtK.toFixed(3)} MRR=${ragMetrics.mrr.toFixed(3)}`
    );
  }

  // ベイズ推論評価
  if (input.bayesCases && input.bayesCases.length > 0) {
    const auroc = computeAuroc(input.bayesCases);
    const { sensitivity, specificity } = computeSensitivitySpecificity(input.bayesCases);
    metrics.auroc = auroc;
    metrics.sensitivity = sensitivity;
    metrics.specificity = specificity;

    for (const c of input.bayesCases) {
      const predicted = c.predictedScore >= 0.5 ? 1 : 0;
      const passed = predicted === c.trueLabel01;
      allCaseResults.push({
        caseId: c.caseId,
        passed,
        score: c.predictedScore,
        detail: { trueLabel01: c.trueLabel01, predicted },
      });
    }

    console.info(
      `[evaluation] Bayes: AUROC=${auroc.toFixed(3)} Sens=${sensitivity.toFixed(3)} Spec=${specificity.toFixed(3)}`
    );
  }

  // LLM 品質評価
  if (input.llmCases && input.llmCases.length > 0) {
    const { avgCosineSimilarity, caseScores } = await evaluateLlmQuality(input.llmCases);
    metrics.avgCosineSimilarity = avgCosineSimilarity;
    metrics.bertScoreApprox = avgCosineSimilarity; // 近似値として同値

    const scoreMap = new Map(caseScores.map((s) => [s.caseId, s.score]));
    for (const c of input.llmCases) {
      const score = scoreMap.get(c.caseId) ?? 0;
      allCaseResults.push({
        caseId: c.caseId,
        passed: score >= 0.7,
        score,
        detail: { cosineSimilarity: score },
      });
    }

    console.info(
      `[evaluation] LLM Quality: avgCosine=${avgCosineSimilarity.toFixed(3)}`
    );
  }

  // 総合パスレート
  metrics.overallPassRate =
    allCaseResults.length > 0
      ? allCaseResults.filter((r) => r.passed).length / allCaseResults.length
      : 0;

  const completedAt = new Date().toISOString();

  const runResult: EvaluationRunResult = {
    runId,
    evaluationType: "composite",
    startedAt,
    completedAt,
    metrics,
    caseResults: allCaseResults,
    // exactOptionalPropertyTypes: undefined を除外して代入
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };

  // Supabase に保存
  await saveEvaluationRun(runResult, supabase);

  return runResult;
}
