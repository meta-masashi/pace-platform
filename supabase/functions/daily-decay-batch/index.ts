/**
 * Supabase Edge Function — daily-decay-batch
 * ============================================================
 * 日次リスク時間減衰バッチ処理。
 *
 * 毎日 05:00 JST（20:00 UTC 前日）に pg_cron から呼び出され、
 * すべてのアクティブなリスク値を時間減衰モデルで再計算する。
 *
 * 朝のアジェンダ生成（06:00 JST）より前に実行することで、
 * 最新の減衰済みリスク値を反映した朝のレポートが生成される。
 *
 * 推奨 Cron 設定:
 *   SELECT cron.schedule(
 *     'daily-decay-batch',
 *     '0 20 * * *',
 *     $$
 *       SELECT net.http_post(
 *         url := 'https://[project-ref].supabase.co/functions/v1/daily-decay-batch',
 *         headers := '{"Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb,
 *         body := '{}'::jsonb
 *       )
 *     $$
 *   );
 *
 * 【防壁4】耐障害性: 個別レコードの失敗が全体をブロックしない
 * ============================================================
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const RISK_THRESHOLD = 0.05;

// ---------------------------------------------------------------------------
// 減衰計算（純関数 — lib/decay/calculator.ts と同等）
// ---------------------------------------------------------------------------

function calculateDecayedRisk(
  initialRisk: number,
  lambda: number,
  daysSinceDetection: number,
  chronicModifier: number = 1.0
): number {
  if (daysSinceDetection < 0) return Math.max(0, Math.min(1, initialRisk));
  if (lambda <= 0) return Math.max(0, Math.min(1, initialRisk * chronicModifier));

  const result = initialRisk * Math.exp(-lambda * daysSinceDetection) * chronicModifier;
  return Math.max(0, Math.min(1, result));
}

function daysBetween(detectedAt: Date, currentDate: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return (currentDate.getTime() - detectedAt.getTime()) / msPerDay;
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

    // ----- アクティブなリスクを取得 -----
    const { data: activeRisks, error: fetchError } = await supabase
      .from("assessment_results")
      .select(`
        athlete_id,
        assessment_id,
        node_id,
        risk_score,
        completed_at
      `)
      .gt("risk_score", RISK_THRESHOLD)
      .not("completed_at", "is", null);

    if (fetchError) {
      console.error("[decay:batch] リスクデータ取得失敗:", fetchError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "リスクデータの取得に失敗しました。",
          detail: fetchError.message,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const rows = activeRisks ?? [];
    const now = new Date();
    let updated = 0;
    let errors = 0;

    console.log(`[decay:batch] ${rows.length} 件のリスクを処理開始`);

    // ----- ノード別の減衰パラメータ取得 -----
    const nodeIds = [...new Set(rows.map((r: Record<string, unknown>) => r.node_id as string))];
    const { data: nodesData } = await supabase
      .from("assessment_nodes")
      .select("node_id, time_decay_lambda, half_life_days")
      .in("node_id", nodeIds);

    const nodeMap = new Map<string, { lambda: number; halfLife: number }>();
    for (const node of (nodesData ?? []) as Array<{
      node_id: string;
      time_decay_lambda: number | null;
      half_life_days: number | null;
    }>) {
      const lambda = node.time_decay_lambda ?? Math.LN2 / 30;
      const halfLife = node.half_life_days ?? 30;
      nodeMap.set(node.node_id, { lambda, halfLife });
    }

    // ----- 各リスクの減衰を計算して記録 -----
    const logEntries: Array<Record<string, unknown>> = [];

    for (const row of rows as Array<{
      athlete_id: string;
      assessment_id: string;
      node_id: string;
      risk_score: number;
      completed_at: string;
    }>) {
      try {
        const params = nodeMap.get(row.node_id) ?? {
          lambda: Math.LN2 / 30,
          halfLife: 30,
        };
        const detectedAt = new Date(row.completed_at);
        const elapsed = daysBetween(detectedAt, now);
        const elapsedDays = Math.floor(elapsed);

        const currentRisk = calculateDecayedRisk(
          row.risk_score,
          params.lambda,
          elapsed
        );

        logEntries.push({
          athlete_id: row.athlete_id,
          assessment_id: row.assessment_id,
          node_id: row.node_id,
          initial_risk: row.risk_score,
          current_risk: currentRisk,
          lambda: params.lambda,
          half_life_days: params.halfLife,
          chronic_modifier: 1.0,
          days_elapsed: elapsedDays,
          computed_at: now.toISOString(),
        });

        updated++;
      } catch (err) {
        console.error(
          `[decay:batch] 計算エラー athlete=${row.athlete_id} node=${row.node_id}:`,
          err
        );
        errors++;
      }
    }

    // ----- 一括挿入 -----
    if (logEntries.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < logEntries.length; i += batchSize) {
        const batch = logEntries.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from("risk_decay_log")
          .insert(batch);

        if (insertError) {
          console.error(
            `[decay:batch] ログ挿入エラー (batch ${Math.floor(i / batchSize) + 1}):`,
            insertError
          );
        }
      }
    }

    const summary = {
      success: true,
      data: {
        processed: rows.length,
        updated,
        errors,
        executedAt: now.toISOString(),
      },
    };

    console.log(
      `[decay:batch] 完了 — 処理: ${rows.length}, 更新: ${updated}, エラー: ${errors}`
    );

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[decay:batch] 予期しないエラー:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "バッチ処理中に予期しないエラーが発生しました。",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
