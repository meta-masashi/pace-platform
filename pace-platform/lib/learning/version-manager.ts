/**
 * PACE Platform — モデルバージョン管理
 *
 * DAG ノード LR 値のバージョニングとロールバック機能を提供する。
 *
 * 各バージョンはすべてのノードの LR 値のスナップショットを保持し、
 * 問題が発生した場合に以前のバージョンへロールバック可能。
 *
 * - csv_baseline: 初期 CSV インポート時のベースライン
 * - bayesian_update: 週次バッチ学習による自動更新
 * - manual_override: master ロールによる手動承認
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelVersion, ModelVersionSource } from "./types";

// ---------------------------------------------------------------------------
// DB行型
// ---------------------------------------------------------------------------

interface ModelVersionRow {
  id: string;
  version: string;
  source: string;
  node_weights: Record<string, number>;
  created_at: string;
  approved_by: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// バージョン保存
// ---------------------------------------------------------------------------

/**
 * モデルバージョンスナップショットを保存する。
 *
 * ノードの LR 値マップを JSONB として model_versions テーブルに永続化する。
 *
 * @param supabase - Supabase クライアント
 * @param version - 保存するモデルバージョン
 */
export async function saveModelVersion(
  supabase: SupabaseClient,
  version: ModelVersion
): Promise<void> {
  // Map を plain object に変換
  const nodeWeightsObj: Record<string, number> = {};
  for (const [key, value] of version.nodeWeights.entries()) {
    nodeWeightsObj[key] = value;
  }

  const { error } = await supabase.from("model_versions").insert({
    version: version.version,
    source: version.source,
    node_weights: nodeWeightsObj,
    created_at: version.createdAt.toISOString(),
    approved_by: version.approvedBy ?? null,
    notes: version.notes ?? null,
  });

  if (error) {
    console.error(
      `[learning:version] バージョン ${version.version} の保存失敗:`,
      error
    );
    throw new Error(`モデルバージョン保存エラー: ${error.message}`);
  }

  console.log(
    `[learning:version] バージョン ${version.version} を保存 (source: ${version.source})`
  );
}

// ---------------------------------------------------------------------------
// バージョン取得
// ---------------------------------------------------------------------------

/**
 * 指定バージョンのモデルを取得する。
 *
 * @param supabase - Supabase クライアント
 * @param versionStr - バージョン文字列（例: "v1.0"）
 * @returns モデルバージョン、見つからない場合は null
 */
export async function getModelVersion(
  supabase: SupabaseClient,
  versionStr: string
): Promise<ModelVersion | null> {
  const { data, error } = await supabase
    .from("model_versions")
    .select("*")
    .eq("version", versionStr)
    .single();

  if (error || !data) {
    return null;
  }

  return rowToModelVersion(data as ModelVersionRow);
}

/**
 * 最新のモデルバージョンを取得する。
 *
 * @param supabase - Supabase クライアント
 * @returns 最新のモデルバージョン、存在しない場合は null
 */
export async function getLatestVersion(
  supabase: SupabaseClient
): Promise<ModelVersion | null> {
  const { data, error } = await supabase
    .from("model_versions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return rowToModelVersion(data as ModelVersionRow);
}

/**
 * すべてのモデルバージョンを一覧取得する（新しい順）。
 *
 * @param supabase - Supabase クライアント
 * @returns モデルバージョンの配列
 */
export async function listVersions(
  supabase: SupabaseClient
): Promise<ModelVersion[]> {
  const { data, error } = await supabase
    .from("model_versions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("[learning:version] バージョン一覧取得エラー:", error);
    return [];
  }

  return (data as ModelVersionRow[]).map(rowToModelVersion);
}

// ---------------------------------------------------------------------------
// ロールバック
// ---------------------------------------------------------------------------

/**
 * 指定バージョンの LR 値にロールバックする。
 *
 * 処理:
 * 1. 指定バージョンのスナップショットを取得
 * 2. 各ノードの assessment_nodes.lr_yes_sr を復元
 * 3. ロールバック記録として新バージョンを保存
 *
 * @param supabase - サービスロール権限の Supabase クライアント
 * @param targetVersion - ロールバック先のバージョン文字列
 * @param staffId - 実行したスタッフID
 * @returns 復元されたノード数
 * @throws バージョンが見つからない場合
 */
export async function rollbackToVersion(
  supabase: SupabaseClient,
  targetVersion: string,
  staffId: string
): Promise<number> {
  // ----- 1. 対象バージョンを取得 -----
  const version = await getModelVersion(supabase, targetVersion);
  if (!version) {
    throw new Error(`バージョン ${targetVersion} が見つかりません。`);
  }

  // ----- 2. 各ノードの LR を復元 -----
  let restoredCount = 0;

  for (const [nodeId, lrValue] of version.nodeWeights.entries()) {
    const { error } = await supabase
      .from("assessment_nodes")
      .update({ lr_yes_sr: lrValue })
      .eq("node_id", nodeId);

    if (error) {
      console.error(
        `[learning:version] ノード ${nodeId} のロールバック失敗:`,
        error
      );
    } else {
      restoredCount++;
    }
  }

  // ----- 3. ロールバック記録を保存 -----
  const latestVersion = await getLatestVersion(supabase);
  const rollbackVersionStr = generateRollbackVersion(
    latestVersion?.version
  );

  await saveModelVersion(supabase, {
    version: rollbackVersionStr,
    createdAt: new Date(),
    nodeWeights: version.nodeWeights,
    source: "manual_override",
    approvedBy: staffId,
    notes: `ロールバック: ${targetVersion} に復元`,
  });

  console.log(
    `[learning:version] ロールバック完了 — ${targetVersion} に復元, ${restoredCount} ノード`
  );

  return restoredCount;
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB行をモデルバージョンに変換する。
 */
function rowToModelVersion(row: ModelVersionRow): ModelVersion {
  const weights = new Map<string, number>();
  if (row.node_weights && typeof row.node_weights === "object") {
    for (const [key, value] of Object.entries(row.node_weights)) {
      weights.set(key, value as number);
    }
  }

  return {
    version: row.version,
    createdAt: new Date(row.created_at),
    nodeWeights: weights,
    source: row.source as ModelVersionSource,
    approvedBy: row.approved_by ?? undefined,
    notes: row.notes ?? undefined,
  };
}

/**
 * ロールバック用のバージョン番号を生成する。
 */
function generateRollbackVersion(currentVersion?: string): string {
  if (!currentVersion) return "v1.0-rollback";

  const match = currentVersion.match(/^v(\d+)\.(\d+)/);
  if (!match || !match[1] || !match[2]) return "v1.0-rollback";

  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  return `v${major}.${minor + 1}`;
}
