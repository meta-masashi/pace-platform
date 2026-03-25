/**
 * PACE Platform — リスク減衰ステータス API
 *
 * GET /api/decay/status?athleteId=xxx
 *
 * 指定アスリートのすべてのアクティブなリスクについて、
 * 現在の時間減衰後の値と完全回復までの推定日数を返す。
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  calculateDecayedRisk,
  daysBetween,
  daysUntilThreshold,
  halfLifeFromLambda,
  RISK_THRESHOLD,
} from "@/lib/decay/calculator";
import type { DecayStatusResponse, DecayStatusEntry } from "@/lib/decay/types";

// ---------------------------------------------------------------------------
// エラーレスポンス型
// ---------------------------------------------------------------------------

interface ErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// GET /api/decay/status
// ---------------------------------------------------------------------------

export async function GET(
  request: Request
): Promise<NextResponse<DecayStatusResponse | ErrorResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const athleteId = searchParams.get("athleteId");

    // ----- バリデーション -----
    if (!athleteId) {
      return NextResponse.json(
        { success: false, error: "athleteId クエリパラメータが必要です。" },
        { status: 400 }
      );
    }

    // ----- 認証チェック -----
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "認証が必要です。ログインしてください。" },
        { status: 401 }
      );
    }

    // ----- アスリートのアクセス確認（RLS 経由で同組織のスタッフのみ）-----
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .select("id, org_id")
      .eq("id", athleteId)
      .single();

    if (athleteError || !athlete) {
      return NextResponse.json(
        {
          success: false,
          error: "指定されたアスリートが見つからないか、アクセス権がありません。",
        },
        { status: 403 }
      );
    }

    // ----- 最新の減衰ログを取得 -----
    // 各ノードについて最新の computed_at のレコードのみ取得
    const { data: decayLogs, error: logError } = await supabase
      .from("risk_decay_log")
      .select("*")
      .eq("athlete_id", athleteId)
      .gt("current_risk", RISK_THRESHOLD)
      .order("computed_at", { ascending: false });

    if (logError) {
      console.error("[decay:status] 減衰ログ取得エラー:", logError);
      return NextResponse.json(
        { success: false, error: "減衰データの取得に失敗しました。" },
        { status: 500 }
      );
    }

    // 各 (assessment_id, node_id) について最新のみ抽出
    const latestMap = new Map<string, typeof decayLogs[0]>();
    for (const log of decayLogs ?? []) {
      const key = `${log.assessment_id}:${log.node_id}`;
      if (!latestMap.has(key)) {
        latestMap.set(key, log);
      }
    }

    // ----- レスポンス構築 -----
    const now = new Date();
    const activeRisks: DecayStatusEntry[] = [];

    for (const [, log] of latestMap) {
      const lambda = (log.lambda as number) ?? 0;
      const initialRisk = log.initial_risk as number;
      const halfLife = (log.half_life_days as number) ?? (lambda > 0 ? halfLifeFromLambda(lambda) : 30);

      // リアルタイムの減衰値を再計算（ログ記録時点からの差分も反映）
      const detectedAtStr = log.computed_at as string;
      const computedAt = new Date(detectedAtStr);
      const daysFromLog = daysBetween(computedAt, now);
      const currentRiskFromLog = log.current_risk as number;

      // ログ記録時点からさらに減衰
      const realtimeRisk = calculateDecayedRisk(
        currentRiskFromLog,
        lambda > 0 ? lambda : Math.LN2 / 30,
        daysFromLog
      );

      if (realtimeRisk <= RISK_THRESHOLD) {
        continue; // 既に回復済み
      }

      const totalElapsed = (log.days_elapsed as number) + Math.floor(daysFromLog);
      const estimatedDays = daysUntilThreshold(realtimeRisk, lambda > 0 ? lambda : Math.LN2 / 30);

      activeRisks.push({
        nodeId: log.node_id as string,
        assessmentId: log.assessment_id as string,
        initialRisk,
        currentRisk: Math.round(realtimeRisk * 1000) / 1000,
        daysSinceDetection: totalElapsed,
        halfLifeDays: halfLife,
        lambda: lambda > 0 ? lambda : Math.LN2 / 30,
        estimatedDaysToRecovery: estimatedDays,
      });
    }

    // リスクの高い順にソート
    activeRisks.sort((a, b) => b.currentRisk - a.currentRisk);

    return NextResponse.json({
      success: true,
      data: {
        athleteId,
        activeRisks,
        computedAt: now.toISOString(),
      },
    });
  } catch (err) {
    console.error("[decay:status] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}
