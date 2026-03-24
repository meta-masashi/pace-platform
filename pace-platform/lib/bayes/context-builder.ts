/**
 * PACE Platform — ベイズ推論結果 → Gemini Context JSON 変換
 *
 * DiagnosisResult（ベイズエンジン出力）を
 * context-injector.ts が受け付ける BayesianDiagnosisResult 形式に変換する。
 *
 * この変換レイヤーにより:
 *   - ベイズエンジン API 変更の影響を Gemini レイヤーから隔離
 *   - v2/v3 エンジン間の互換性を保持
 *   - LLM Context Injection に不要な内部情報を除外
 */

import type { DiagnosisResult, NodeResponse } from "./types";
import type { BayesianDiagnosisResult } from "../gemini/context-injector";

// ---------------------------------------------------------------------------
// メイン変換関数
// ---------------------------------------------------------------------------

/**
 * ベイズエンジンの DiagnosisResult を Gemini Context 形式に変換する。
 *
 * @param diagnosis  ベイズエンジンからの診断結果
 * @param responses  アセスメントで収集したノード回答（エビデンス抽出用）
 */
export function buildGeminiContext(
  diagnosis: DiagnosisResult,
  responses: NodeResponse[]
): BayesianDiagnosisResult {
  // 上位 3 件の診断候補を変換
  const topDiagnoses = diagnosis.top_diagnoses.slice(0, 3).map((dx) => ({
    label: dx.label,
    posterior: dx.posterior,
    riskLevel: dx.risk_level,
    soapTemplates: dx.soap_templates,
  }));

  // 主要エビデンスノードを抽出（LR の絶対値が大きい上位 5 件）
  const keyEvidenceNodes = extractKeyEvidenceNodes(responses, 5);

  return {
    sessionId: diagnosis.session_id,
    athleteId: diagnosis.athlete_id,
    assessmentType: diagnosis.assessment_type,
    topDiagnoses,
    keyEvidenceNodes,
    contraindicationTags: diagnosis.contraindication_tags,
    prescriptionTags: diagnosis.prescription_tags,
    overallRiskLevel: diagnosis.overall_risk_level,
    hardLockActive: diagnosis.hard_lock_active,
    completedAt: diagnosis.completed_at,
  };
}

// ---------------------------------------------------------------------------
// エビデンスノード抽出
// ---------------------------------------------------------------------------

/**
 * アセスメント回答から診断に最も影響を与えたノードを抽出する。
 * 尤度比（LR）の絶対的影響度でソートする。
 */
function extractKeyEvidenceNodes(
  responses: NodeResponse[],
  topN: number
): BayesianDiagnosisResult["keyEvidenceNodes"] {
  return responses
    .map((r) => {
      // 実際に使用された LR（回答に基づく）
      const effectiveLr = r.answer === "yes" ? r.lr_yes : r.answer === "no" ? r.lr_no : 1.0;
      // LR の診断的影響度（1.0 からの乖離が大きいほど影響が大きい）
      const impact = Math.abs(Math.log(effectiveLr));

      return {
        nodeId: r.node_id,
        description: r.target_axis, // 軸情報をフォールバックとして使用
        answer: r.answer,
        likelihoodRatio: effectiveLr,
        impact,
      };
    })
    .sort((a, b) => b.impact - a.impact)
    .slice(0, topN)
    .map(({ impact: _impact, ...node }) => node);
}

// ---------------------------------------------------------------------------
// リスクレベル判定ユーティリティ
// ---------------------------------------------------------------------------

/**
 * ポステリア確率からリスクレベルを判定する。
 * ベイズエンジンがリスクレベルを返さない場合のフォールバック。
 */
export function posteriorToRiskLevel(
  posterior: number
): "critical" | "high" | "medium" | "low" {
  if (posterior >= 0.8) return "critical";
  if (posterior >= 0.6) return "high";
  if (posterior >= 0.4) return "medium";
  return "low";
}

/**
 * Hard Lock を自動的に判定する基準。
 * masterが明示的に設定していない場合、以下の条件で自動フラグを立てる:
 *   - 上位候補のポステリア >= 0.85 かつリスク = critical
 */
export function shouldAutoHardLock(diagnosis: DiagnosisResult): boolean {
  const topDx = diagnosis.top_diagnoses[0];
  if (!topDx) return false;
  return topDx.posterior >= 0.85 && topDx.risk_level === "critical";
}

// ---------------------------------------------------------------------------
// Gemini Context JSON シリアライズ
// ---------------------------------------------------------------------------

/**
 * BayesianDiagnosisResult を JSON 文字列にシリアライズする。
 * Supabase Edge Function での転送や DB 保存に使用。
 */
export function serializeGeminiContext(context: BayesianDiagnosisResult): string {
  return JSON.stringify(context, null, 2);
}

/**
 * JSON 文字列から BayesianDiagnosisResult を復元する。
 * DB から取得したコンテキストを Gemini レイヤーに渡す際に使用。
 *
 * @throws SyntaxError — 不正な JSON
 */
export function deserializeGeminiContext(json: string): BayesianDiagnosisResult {
  const parsed = JSON.parse(json);

  // 必須フィールドの存在チェック（防壁4）
  const requiredFields: (keyof BayesianDiagnosisResult)[] = [
    "sessionId",
    "athleteId",
    "assessmentType",
    "topDiagnoses",
    "overallRiskLevel",
    "hardLockActive",
  ];

  for (const field of requiredFields) {
    if (!(field in parsed)) {
      throw new Error(`GeminiContext デシリアライズ失敗: 必須フィールド "${field}" が欠落`);
    }
  }

  return parsed as BayesianDiagnosisResult;
}
