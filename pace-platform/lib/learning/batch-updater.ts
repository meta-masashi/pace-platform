/**
 * PACE Platform — 週次バッチ学習プロセッサ
 *
 * 毎週日曜 03:00 JST に実行され、過去のアセスメント回答と
 * 受傷ログを照合して DAG ノードの LR 値を自動更新する。
 *
 * 処理フロー:
 * 1. 前回バッチ以降の assessment_responses + injury logs を取得
 * 2. ノードごとに LearningDataPoint を構築
 * 3. 十分なデータがあるノードの LR を再計算
 * 4. 安全バウンド内 → assessment_nodes.lr_yes を自動更新
 * 5. 安全バウンド外 → lr_update_proposals にヒューマンレビュー提案を挿入
 * 6. モデルバージョンスナップショットを保存
 *
 * 【防壁4】耐障害性: 1件の失敗が他の処理をブロックしない
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from '@/lib/observability/logger';
const log = createLogger('learning');
import type {
  LearningDataPoint,
  LearningBatchResult,
  LRUpdateResult,
} from "./types";
import {
  calculateUpdatedLR,
  calculateDeviationPct,
} from "./lr-updater";
import { saveModelVersion, getLatestVersion } from "./version-manager";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 受傷追跡ウィンドウ（日数） — アセスメントから 28日以内の受傷を対象 */
const INJURY_TRACKING_WINDOW_DAYS = 28;

/** デフォルトの最小サンプルサイズ */
const DEFAULT_MIN_SAMPLE_SIZE = 30;

// ---------------------------------------------------------------------------
// DB行型
// ---------------------------------------------------------------------------

interface AssessmentResponseRow {
  id: string;
  assessment_id: string;
  node_id: string;
  answer: string;
  athlete_id: string;
  completed_at: string;
}

interface InjuryLogRow {
  athlete_id: string;
  injury_date: string;
  node_id: string | null;
  body_region: string | null;
}

interface AssessmentNodeRow {
  node_id: string;
  lr_yes: number;
  lr_yes_sr: number | null;
  base_prevalence: number;
}

// ---------------------------------------------------------------------------
// バッチ実行
// ---------------------------------------------------------------------------

/**
 * 週次学習バッチを実行する。
 *
 * @param supabase - サービスロール権限の Supabase クライアント
 * @param minSampleSize - ノード更新に必要な最小サンプルサイズ
 * @returns バッチ学習結果サマリー
 */
export async function runLearningBatch(
  supabase: SupabaseClient,
  minSampleSize: number = DEFAULT_MIN_SAMPLE_SIZE
): Promise<LearningBatchResult> {
  const result: LearningBatchResult = {
    version: "",
    updatedNodes: 0,
    safeUpdates: 0,
    flaggedUpdates: 0,
    skippedNodes: 0,
    details: [],
  };

  // ----- 1. 前回バッチ実行時刻を取得 -----
  const lastVersion = await getLatestVersion(supabase);
  const lastBatchDate = lastVersion
    ? lastVersion.createdAt
    : new Date(0); // 初回は全期間

  log.info(`前回バッチ: ${lastBatchDate.toISOString()}`);

  // ----- 2. アセスメント回答を取得 -----
  const responses = await fetchAssessmentResponses(supabase, lastBatchDate);
  if (responses.length === 0) {
    log.info('新しいアセスメント回答なし — スキップ');
    result.version = lastVersion?.version ?? "v1.0";
    return result;
  }

  log.info(`${responses.length} 件のアセスメント回答を取得`);

  // ----- 3. 受傷ログを取得 -----
  const injuries = await fetchInjuryLogs(supabase, lastBatchDate);
  log.info(`${injuries.length} 件の受傷ログを取得`);

  // ----- 4. ノードごとの学習データを構築 -----
  const dataByNode = buildLearningDataByNode(responses, injuries);

  // ----- 5. ノード定義を取得 -----
  const nodeIds = Array.from(dataByNode.keys());
  const nodeDefinitions = await fetchNodeDefinitions(supabase, nodeIds);

  // ----- 6. 次バージョン番号を生成 -----
  const nextVersion = generateNextVersion(lastVersion?.version);
  result.version = nextVersion;

  // ----- 7. ノードごとに LR を更新 -----
  const updatedWeights = new Map<string, number>();

  for (const [nodeId, dataPoints] of dataByNode.entries()) {
    try {
      const nodeDef = nodeDefinitions.get(nodeId);
      if (!nodeDef) {
        log.warn(`ノード定義なし: ${nodeId} — スキップ`);
        result.skippedNodes++;
        continue;
      }

      const currentLR = nodeDef.lr_yes_sr ?? nodeDef.lr_yes;
      const originalCsvLR = nodeDef.lr_yes; // CSV ベースライン

      const updateResult = calculateUpdatedLR(
        dataPoints,
        currentLR,
        originalCsvLR,
        minSampleSize
      );

      result.details.push(updateResult);

      // サンプル不足でスキップされた場合
      if (updateResult.sampleSize < minSampleSize) {
        result.skippedNodes++;
        updatedWeights.set(nodeId, currentLR);
        continue;
      }

      result.updatedNodes++;

      if (updateResult.isWithinSafetyBounds) {
        // ----- 安全バウンド内: 自動更新 -----
        result.safeUpdates++;
        await updateNodeLR(supabase, nodeId, updateResult.updatedLR);
        updatedWeights.set(nodeId, updateResult.updatedLR);
      } else {
        // ----- 安全バウンド外: 提案を挿入 -----
        result.flaggedUpdates++;
        await insertUpdateProposal(
          supabase,
          nodeId,
          currentLR,
          updateResult.updatedLR,
          originalCsvLR,
          updateResult.sampleSize,
          updateResult.confidence,
          nextVersion
        );
        updatedWeights.set(nodeId, currentLR); // 提案時は元値を維持
      }
    } catch (err) {
      log.errorFromException(`ノード ${nodeId} の処理エラー`, err);
      result.skippedNodes++;
    }
  }

  // ----- 8. モデルバージョンスナップショットを保存 -----
  await saveModelVersion(supabase, {
    version: nextVersion,
    createdAt: new Date(),
    nodeWeights: updatedWeights,
    source: "bayesian_update",
    notes: `バッチ更新: ${result.safeUpdates}件自動, ${result.flaggedUpdates}件レビュー待ち, ${result.skippedNodes}件スキップ`,
  });

  log.info(`完了 — バージョン: ${nextVersion}, 更新: ${result.updatedNodes}, 自動: ${result.safeUpdates}, フラグ: ${result.flaggedUpdates}, スキップ: ${result.skippedNodes}`);

  return result;
}

// ---------------------------------------------------------------------------
// データ取得ヘルパー
// ---------------------------------------------------------------------------

/**
 * 指定日時以降のアセスメント回答を取得する。
 */
async function fetchAssessmentResponses(
  supabase: SupabaseClient,
  since: Date
): Promise<AssessmentResponseRow[]> {
  const { data, error } = await supabase
    .from("assessment_responses")
    .select(`
      id,
      assessment_id,
      node_id,
      answer,
      assessment_sessions!inner (
        athlete_id,
        completed_at
      )
    `)
    .gt("created_at", since.toISOString())
    .not("assessment_sessions.completed_at", "is", null);

  if (error) {
    log.error('回答取得エラー', { data: { error: error.message } });
    return [];
  }

  return (data as unknown as Array<{
    id: string;
    assessment_id: string;
    node_id: string;
    answer: string;
    assessment_sessions: {
      athlete_id: string;
      completed_at: string;
    };
  }>).map((row) => ({
    id: row.id,
    assessment_id: row.assessment_id,
    node_id: row.node_id,
    answer: row.answer,
    athlete_id: row.assessment_sessions.athlete_id,
    completed_at: row.assessment_sessions.completed_at,
  }));
}

/**
 * 指定日時以降の受傷ログを取得する。
 *
 * 受傷ログは追跡ウィンドウ分だけ過去に遡って取得する（
 * 古いアセスメントに対する遅延受傷も捕捉するため）。
 */
async function fetchInjuryLogs(
  supabase: SupabaseClient,
  since: Date
): Promise<InjuryLogRow[]> {
  const extendedSince = new Date(
    since.getTime() - INJURY_TRACKING_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const { data, error } = await supabase
    .from("injury_logs")
    .select("athlete_id, injury_date, node_id, body_region")
    .gt("injury_date", extendedSince.toISOString());

  if (error) {
    log.error('受傷ログ取得エラー', { data: { error: error.message } });
    return [];
  }

  return (data ?? []) as InjuryLogRow[];
}

/**
 * ノード定義を取得する。
 */
async function fetchNodeDefinitions(
  supabase: SupabaseClient,
  nodeIds: string[]
): Promise<Map<string, AssessmentNodeRow>> {
  if (nodeIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("assessment_nodes")
    .select("node_id, lr_yes, lr_yes_sr, base_prevalence")
    .in("node_id", nodeIds);

  if (error) {
    log.error('ノード定義取得エラー', { data: { error: error.message } });
    return new Map();
  }

  const map = new Map<string, AssessmentNodeRow>();
  for (const node of (data ?? []) as AssessmentNodeRow[]) {
    map.set(node.node_id, node);
  }
  return map;
}

// ---------------------------------------------------------------------------
// データ構築
// ---------------------------------------------------------------------------

/**
 * アセスメント回答と受傷ログからノードごとの学習データを構築する。
 *
 * 各アセスメント回答について:
 * - 同一アスリートが追跡ウィンドウ内に受傷したか判定
 * - wasPositive = answer が "yes"
 * - injuryOccurred = 追跡ウィンドウ内の受傷有無
 */
export function buildLearningDataByNode(
  responses: AssessmentResponseRow[],
  injuries: InjuryLogRow[]
): Map<string, LearningDataPoint[]> {
  const result = new Map<string, LearningDataPoint[]>();

  // アスリートごとの受傷イベントをインデックス化
  const injuryIndex = new Map<string, InjuryLogRow[]>();
  for (const inj of injuries) {
    const existing = injuryIndex.get(inj.athlete_id) ?? [];
    existing.push(inj);
    injuryIndex.set(inj.athlete_id, existing);
  }

  for (const resp of responses) {
    const assessmentDate = new Date(resp.completed_at);
    const windowEnd = new Date(
      assessmentDate.getTime() +
        INJURY_TRACKING_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );

    // このアスリートの受傷ログからウィンドウ内の受傷を検索
    const athleteInjuries = injuryIndex.get(resp.athlete_id) ?? [];
    const relevantInjury = athleteInjuries.find((inj) => {
      const injDate = new Date(inj.injury_date);
      return (
        injDate >= assessmentDate &&
        injDate <= windowEnd &&
        (inj.node_id === resp.node_id || inj.node_id === null)
      );
    });

    const dataPoint: LearningDataPoint = {
      nodeId: resp.node_id,
      wasPositive: resp.answer === "yes",
      injuryOccurred: relevantInjury !== undefined,
      assessmentDate,
      injuryDate: relevantInjury
        ? new Date(relevantInjury.injury_date)
        : undefined,
    };

    const existing = result.get(resp.node_id) ?? [];
    existing.push(dataPoint);
    result.set(resp.node_id, existing);
  }

  return result;
}

// ---------------------------------------------------------------------------
// DB 更新ヘルパー
// ---------------------------------------------------------------------------

/**
 * assessment_nodes の lr_yes_sr（自己修正 LR）を更新する。
 */
async function updateNodeLR(
  supabase: SupabaseClient,
  nodeId: string,
  newLR: number
): Promise<void> {
  const { error } = await supabase
    .from("assessment_nodes")
    .update({ lr_yes_sr: newLR })
    .eq("node_id", nodeId);

  if (error) {
    log.error(`ノード ${nodeId} の LR 更新失敗`, { data: { error: error.message } });
  }
}

/**
 * lr_update_proposals にヒューマンレビュー提案を挿入する。
 */
async function insertUpdateProposal(
  supabase: SupabaseClient,
  nodeId: string,
  currentLR: number,
  proposedLR: number,
  originalCsvLR: number,
  sampleSize: number,
  confidence: number,
  batchVersion: string
): Promise<void> {
  const deviationPct = calculateDeviationPct(proposedLR, originalCsvLR);

  const { error } = await supabase.from("lr_update_proposals").insert({
    node_id: nodeId,
    current_lr: currentLR,
    proposed_lr: proposedLR,
    original_csv_lr: originalCsvLR,
    deviation_pct: deviationPct,
    sample_size: sampleSize,
    confidence,
    status: "pending",
    batch_version: batchVersion,
  });

  if (error) {
    log.error(`提案挿入失敗 node=${nodeId}`, { data: { error: error.message } });
  }
}

// ---------------------------------------------------------------------------
// バージョン番号生成
// ---------------------------------------------------------------------------

/**
 * 前バージョンから次バージョン番号を生成する。
 *
 * @param currentVersion - 現在のバージョン文字列（例: "v1.3"）
 * @returns 次バージョン文字列（例: "v1.4"）
 */
export function generateNextVersion(currentVersion?: string): string {
  if (!currentVersion) return "v1.0";

  const match = currentVersion.match(/^v(\d+)\.(\d+)$/);
  if (!match || !match[1] || !match[2]) return "v1.0";

  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  return `v${major}.${minor + 1}`;
}
