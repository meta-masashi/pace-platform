/**
 * Supabase Edge Function — weekly-learning-batch
 * ============================================================
 * 週次 Bayesian Online Learning バッチ処理。
 *
 * 毎週日曜 03:00 JST（土曜 18:00 UTC）に pg_cron から呼び出され、
 * アセスメント回答と受傷アウトカムを照合して DAG ノードの LR 値を
 * 自動更新する。
 *
 * 推奨 Cron 設定:
 *   SELECT cron.schedule(
 *     'weekly-learning-batch',
 *     '0 18 * * 6',
 *     $$
 *       SELECT net.http_post(
 *         url := 'https://[project-ref].supabase.co/functions/v1/weekly-learning-batch',
 *         headers := '{"Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb,
 *         body := '{}'::jsonb
 *       )
 *     $$
 *   );
 *
 * 【防壁4】耐障害性: 個別ノードの失敗が全体をブロックしない
 * ============================================================
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 受傷追跡ウィンドウ（日数） */
const INJURY_TRACKING_WINDOW_DAYS = 28;

/** 最小サンプルサイズ */
const MIN_SAMPLE_SIZE = 30;

/** LR ブレンド重み */
const EXISTING_WEIGHT = 0.7;
const EMPIRICAL_WEIGHT = 0.3;

/** LR 範囲 */
const LR_FLOOR = 0.01;
const LR_CEILING = 100;

/** 安全バウンド逸脱上限 */
const SAFETY_DEVIATION_LIMIT = 0.5;

// ---------------------------------------------------------------------------
// 純関数（lib/learning/lr-updater.ts と同等）
// ---------------------------------------------------------------------------

function calculateSensitivity(tp: number, fn: number): number {
  const d = tp + fn;
  return d === 0 ? 0.5 : tp / d;
}

function calculateSpecificity(tn: number, fp: number): number {
  const d = tn + fp;
  return d === 0 ? 0.5 : tn / d;
}

function calculateEmpiricalLR(sens: number, spec: number): number {
  const fpr = 1 - spec;
  if (fpr <= 0) return LR_CEILING;
  if (sens <= 0) return LR_FLOOR;
  return sens / fpr;
}

function blendLR(current: number, empirical: number): number {
  return current * EXISTING_WEIGHT + empirical * EMPIRICAL_WEIGHT;
}

function clampLR(lr: number): number {
  return Math.max(LR_FLOOR, Math.min(LR_CEILING, lr));
}

function wilsonWidth(p: number, n: number): number {
  if (n <= 0) return 1;
  const z = 1.96;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const hw = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denom;
  return hw * 2;
}

// ---------------------------------------------------------------------------
// Slack 通知
// ---------------------------------------------------------------------------

async function sendSlackSummary(summary: {
  version: string;
  safeUpdates: number;
  flaggedUpdates: number;
  skippedNodes: number;
}): Promise<void> {
  const webhookUrl = Deno.env.get("SLACK_LEARNING_WEBHOOK_URL");
  if (!webhookUrl) {
    console.log("[learning:batch] Slack Webhook URL 未設定 — 通知スキップ");
    return;
  }

  const text =
    `:brain: *PACE 週次学習バッチ完了*\n` +
    `バージョン: \`${summary.version}\`\n` +
    `自動更新: ${summary.safeUpdates} ノード\n` +
    `レビュー待ち: ${summary.flaggedUpdates} ノード\n` +
    `スキップ: ${summary.skippedNodes} ノード`;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error("[learning:batch] Slack 通知送信失敗:", err);
  }
}

// ---------------------------------------------------------------------------
// Edge Function ハンドラ
// ---------------------------------------------------------------------------

serve(async (req) => {
  try {
    // ----- 認証チェック: Service Role Key のみ許可 -----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "認証ヘッダーが必要です。" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ----- 1. 前回バッチ時刻を取得 -----
    const { data: lastVersionRow } = await supabase
      .from("model_versions")
      .select("version, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const lastBatchDate = lastVersionRow
      ? new Date(lastVersionRow.created_at)
      : new Date(0);
    const lastVersionStr = (lastVersionRow?.version as string) ?? undefined;

    console.log(`[learning:batch] 前回バッチ: ${lastBatchDate.toISOString()}`);

    // ----- 2. アセスメント回答を取得 -----
    const { data: responseRows, error: respError } = await supabase
      .from("assessment_responses")
      .select(`
        id, assessment_id, node_id, answer,
        assessment_sessions!inner ( athlete_id, completed_at )
      `)
      .gt("created_at", lastBatchDate.toISOString())
      .not("assessment_sessions.completed_at", "is", null);

    if (respError || !responseRows || responseRows.length === 0) {
      console.log("[learning:batch] 新しいアセスメント回答なし — スキップ");
      return new Response(
        JSON.stringify({
          success: true,
          data: { message: "新しいデータなし", version: lastVersionStr ?? "v1.0" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ----- 3. 受傷ログを取得 -----
    const extendedSince = new Date(
      lastBatchDate.getTime() - INJURY_TRACKING_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );
    const { data: injuryRows } = await supabase
      .from("injury_logs")
      .select("athlete_id, injury_date, node_id, body_region")
      .gt("injury_date", extendedSince.toISOString());

    const injuries = (injuryRows ?? []) as Array<{
      athlete_id: string;
      injury_date: string;
      node_id: string | null;
      body_region: string | null;
    }>;

    // アスリートごとの受傷インデックス
    const injuryIndex = new Map<string, typeof injuries>();
    for (const inj of injuries) {
      const arr = injuryIndex.get(inj.athlete_id) ?? [];
      arr.push(inj);
      injuryIndex.set(inj.athlete_id, arr);
    }

    // ----- 4. ノードごとの分割表を構築 -----
    const nodeStats = new Map<string, { tp: number; fp: number; tn: number; fn: number }>();

    for (const row of responseRows as Array<{
      node_id: string;
      answer: string;
      assessment_sessions: { athlete_id: string; completed_at: string };
    }>) {
      const assessDate = new Date(row.assessment_sessions.completed_at);
      const windowEnd = new Date(
        assessDate.getTime() + INJURY_TRACKING_WINDOW_DAYS * 24 * 60 * 60 * 1000
      );
      const athleteInj = injuryIndex.get(row.assessment_sessions.athlete_id) ?? [];
      const hadInjury = athleteInj.some((inj) => {
        const d = new Date(inj.injury_date);
        return d >= assessDate && d <= windowEnd &&
          (inj.node_id === row.node_id || inj.node_id === null);
      });
      const wasPositive = row.answer === "yes";

      const stats = nodeStats.get(row.node_id) ?? { tp: 0, fp: 0, tn: 0, fn: 0 };
      if (wasPositive && hadInjury) stats.tp++;
      else if (wasPositive && !hadInjury) stats.fp++;
      else if (!wasPositive && !hadInjury) stats.tn++;
      else stats.fn++;
      nodeStats.set(row.node_id, stats);
    }

    // ----- 5. ノード定義を取得 -----
    const nodeIds = Array.from(nodeStats.keys());
    const { data: nodesData } = await supabase
      .from("assessment_nodes")
      .select("node_id, lr_yes, lr_yes_sr")
      .in("node_id", nodeIds);

    const nodeDefs = new Map<string, { lr_yes: number; lr_yes_sr: number | null }>();
    for (const n of (nodesData ?? []) as Array<{
      node_id: string; lr_yes: number; lr_yes_sr: number | null;
    }>) {
      nodeDefs.set(n.node_id, { lr_yes: n.lr_yes, lr_yes_sr: n.lr_yes_sr });
    }

    // ----- 6. バージョン番号を生成 -----
    let nextVersion = "v1.0";
    if (lastVersionStr) {
      const m = lastVersionStr.match(/^v(\d+)\.(\d+)$/);
      if (m) nextVersion = `v${m[1]}.${parseInt(m[2], 10) + 1}`;
    }

    // ----- 7. ノードごとに LR 更新 -----
    let safeUpdates = 0;
    let flaggedUpdates = 0;
    let skippedNodes = 0;
    const updatedWeights: Record<string, number> = {};

    for (const [nodeId, stats] of nodeStats.entries()) {
      const n = stats.tp + stats.fp + stats.tn + stats.fn;
      const def = nodeDefs.get(nodeId);
      if (!def) { skippedNodes++; continue; }

      const currentLR = def.lr_yes_sr ?? def.lr_yes;
      const csvLR = def.lr_yes;

      if (n < MIN_SAMPLE_SIZE) {
        skippedNodes++;
        updatedWeights[nodeId] = currentLR;
        continue;
      }

      const sens = calculateSensitivity(stats.tp, stats.fn);
      const spec = calculateSpecificity(stats.tn, stats.fp);
      const empLR = calculateEmpiricalLR(sens, spec);
      const newLR = clampLR(blendLR(currentLR, empLR));
      const confidence = wilsonWidth(sens, stats.tp + stats.fn);
      const deviation = csvLR > 0 ? Math.abs(newLR - csvLR) / csvLR : Infinity;

      if (deviation <= SAFETY_DEVIATION_LIMIT) {
        // 自動更新
        const { error } = await supabase
          .from("assessment_nodes")
          .update({ lr_yes_sr: newLR })
          .eq("node_id", nodeId);
        if (!error) {
          safeUpdates++;
          updatedWeights[nodeId] = newLR;
        } else {
          console.error(`[learning:batch] ノード更新失敗 ${nodeId}:`, error);
          skippedNodes++;
          updatedWeights[nodeId] = currentLR;
        }
      } else {
        // 提案を挿入
        await supabase.from("lr_update_proposals").insert({
          node_id: nodeId,
          current_lr: currentLR,
          proposed_lr: newLR,
          original_csv_lr: csvLR,
          deviation_pct: deviation,
          sample_size: n,
          confidence,
          status: "pending",
          batch_version: nextVersion,
        });
        flaggedUpdates++;
        updatedWeights[nodeId] = currentLR;
      }
    }

    // ----- 8. モデルバージョンを保存 -----
    await supabase.from("model_versions").insert({
      version: nextVersion,
      source: "bayesian_update",
      node_weights: updatedWeights,
      notes: `バッチ更新: ${safeUpdates}件自動, ${flaggedUpdates}件レビュー待ち, ${skippedNodes}件スキップ`,
    });

    // ----- 9. Slack 通知 -----
    await sendSlackSummary({
      version: nextVersion,
      safeUpdates,
      flaggedUpdates,
      skippedNodes,
    });

    const summary = {
      success: true,
      data: {
        version: nextVersion,
        updatedNodes: safeUpdates + flaggedUpdates,
        safeUpdates,
        flaggedUpdates,
        skippedNodes,
        executedAt: new Date().toISOString(),
      },
    };

    console.log(
      `[learning:batch] 完了 — v${nextVersion}, 自動: ${safeUpdates}, フラグ: ${flaggedUpdates}, スキップ: ${skippedNodes}`
    );

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[learning:batch] 予期しないエラー:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "バッチ処理中に予期しないエラーが発生しました。",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
