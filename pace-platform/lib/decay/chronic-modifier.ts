/**
 * PACE Platform — 慢性 α 修正係数（Chronic α Modifier）
 *
 * 繰り返し受傷するアスリートのリスク減衰を遅らせるための修正係数を
 * 過去の評価履歴から算出する。
 *
 * 算出ルール:
 *   - 過去 12ヶ月間で同一ノードが陽性判定された回数をカウント
 *   - modifier = 1.0 + (recurrenceCount × 0.15)
 *   - 上限: 2.0（キャップ）
 *
 * 適用:
 *   Risk(t) = Risk(0) × e^(-λt) × chronicModifier
 *   chronicModifier > 1.0 → 減衰が遅い（リスクが高めに維持）
 *
 * 例:
 *   - 初発: modifier = 1.0（標準減衰）
 *   - 3回再発: modifier = 1.0 + (3 × 0.15) = 1.45
 *   - 7回以上: modifier = 2.0（キャップ）
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from '@/lib/observability/logger';
const log = createLogger('decay');

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 再発1回あたりの修正係数増分 */
const INCREMENT_PER_RECURRENCE = 0.15;

/** 修正係数の上限 */
const MODIFIER_CAP = 2.0;

/** 修正係数のベース値 */
const MODIFIER_BASE = 1.0;

/** 履歴参照期間（月数） */
const LOOKBACK_MONTHS = 12;

// ---------------------------------------------------------------------------
// 純関数: 修正係数算出
// ---------------------------------------------------------------------------

/**
 * 再発回数から慢性 α 修正係数を算出する（純関数）。
 *
 * @param recurrenceCount - 過去 12ヶ月の再発回数
 * @returns 修正係数（1.0〜2.0）
 *
 * @example
 * ```ts
 * computeChronicModifier(0); // => 1.0
 * computeChronicModifier(3); // => 1.45
 * computeChronicModifier(10); // => 2.0 (capped)
 * ```
 */
export function computeChronicModifier(recurrenceCount: number): number {
  if (recurrenceCount <= 0) return MODIFIER_BASE;

  const raw = MODIFIER_BASE + recurrenceCount * INCREMENT_PER_RECURRENCE;
  return Math.min(raw, MODIFIER_CAP);
}

// ---------------------------------------------------------------------------
// DB 連携: アスリート×ノードの修正係数算出
// ---------------------------------------------------------------------------

/**
 * 特定アスリート・ノードの慢性 α 修正係数を算出する。
 *
 * 過去 12ヶ月間のアセスメント回答から当該ノードが陽性（Yes）と
 * 判定された回数をカウントし、修正係数を算出する。
 *
 * @param supabase - Supabase クライアント
 * @param athleteId - アスリートID
 * @param nodeId - アセスメントノードID
 * @returns 修正係数（1.0〜2.0）
 */
export async function calculateChronicModifier(
  supabase: SupabaseClient,
  athleteId: string,
  nodeId: string
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - LOOKBACK_MONTHS);

  // 過去12ヶ月で当該ノードが陽性判定された回数をカウント
  const { count, error } = await supabase
    .from("assessment_responses")
    .select("id", { count: "exact", head: true })
    .eq("node_id", nodeId)
    .eq("answer", "yes")
    .gt("created_at", cutoffDate.toISOString())
    .in(
      "assessment_id",
      // サブクエリ: 当該アスリートのアセスメントID
      (
        await supabase
          .from("assessment_sessions")
          .select("id")
          .eq("athlete_id", athleteId)
      ).data?.map((s: { id: string }) => s.id) ?? []
    );

  if (error) {
    log.error(`再発回数カウントエラー athlete=${athleteId} node=${nodeId}`, { data: { error: error.message } });
    return MODIFIER_BASE;
  }

  const recurrenceCount = (count ?? 0) > 0 ? (count ?? 0) - 1 : 0;
  // 最初の1回は「初発」なので再発回数は total - 1

  return computeChronicModifier(recurrenceCount);
}

// ---------------------------------------------------------------------------
// バッチ更新: アスリート全ノードの修正係数を再計算
// ---------------------------------------------------------------------------

/**
 * 指定アスリートのすべてのアクティブなノードについて
 * 慢性 α 修正係数を再計算し、athlete_chronic_modifiers テーブルを更新する。
 *
 * @param supabase - Supabase クライアント
 * @param athleteId - アスリートID
 */
export async function updateChronicModifiers(
  supabase: SupabaseClient,
  athleteId: string
): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - LOOKBACK_MONTHS);

  // ----- 1. 当該アスリートの全アセスメントIDを取得 -----
  const { data: sessions } = await supabase
    .from("assessment_sessions")
    .select("id")
    .eq("athlete_id", athleteId);

  const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id);
  if (sessionIds.length === 0) return;

  // ----- 2. 過去12ヶ月の陽性回答をノード別に集計 -----
  const { data: responses, error } = await supabase
    .from("assessment_responses")
    .select("node_id, created_at")
    .eq("answer", "yes")
    .gt("created_at", cutoffDate.toISOString())
    .in("assessment_id", sessionIds);

  if (error || !responses) {
    log.error(`回答取得エラー athlete=${athleteId}`, { data: { error: error.message } });
    return;
  }

  // ノードごとの出現回数を集計
  const nodeCounts = new Map<string, { count: number; lastOccurrence: Date }>();
  for (const resp of responses as Array<{
    node_id: string;
    created_at: string;
  }>) {
    const existing = nodeCounts.get(resp.node_id);
    const respDate = new Date(resp.created_at);

    if (existing) {
      existing.count++;
      if (respDate > existing.lastOccurrence) {
        existing.lastOccurrence = respDate;
      }
    } else {
      nodeCounts.set(resp.node_id, { count: 1, lastOccurrence: respDate });
    }
  }

  // ----- 3. 修正係数を計算して upsert -----
  for (const [nodeId, { count, lastOccurrence }] of nodeCounts.entries()) {
    const recurrenceCount = count > 0 ? count - 1 : 0;
    const modifier = computeChronicModifier(recurrenceCount);

    const { error: upsertError } = await supabase
      .from("athlete_chronic_modifiers")
      .upsert(
        {
          athlete_id: athleteId,
          node_id: nodeId,
          recurrence_count: recurrenceCount,
          modifier,
          last_occurrence: lastOccurrence.toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "athlete_id,node_id" }
      );

    if (upsertError) {
      log.error(`upsert エラー athlete=${athleteId} node=${nodeId}`, { data: { error: upsertError.message } });
    }
  }

  log.info(`athlete=${athleteId} — ${nodeCounts.size} ノードの修正係数を更新`);
}

// ---------------------------------------------------------------------------
// バッチ: 全アスリートの修正係数を取得（decay batch 用）
// ---------------------------------------------------------------------------

/**
 * 指定アスリートのすべての慢性 α 修正係数をまとめて取得する。
 *
 * @param supabase - Supabase クライアント
 * @param athleteId - アスリートID
 * @returns ノードID → 修正係数のマップ
 */
export async function getChronicModifiers(
  supabase: SupabaseClient,
  athleteId: string
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("athlete_chronic_modifiers")
    .select("node_id, modifier")
    .eq("athlete_id", athleteId);

  const result = new Map<string, number>();

  if (error || !data) {
    return result;
  }

  for (const row of data as Array<{ node_id: string; modifier: number }>) {
    result.set(row.node_id, row.modifier);
  }

  return result;
}
