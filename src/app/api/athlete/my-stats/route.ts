/**
 * GET /api/athlete/my-stats
 *
 * 選手が自分自身のキネマティクス・疲労スコア・CV解析履歴を取得するエンドポイント。
 * Phase 4 Sprint 3（P4-16）
 *
 * RLS: 認証済み選手（athletes テーブルの auth_user_id = auth.uid()）のみ自身のデータに
 * アクセス可能。スタッフも自チームの選手データを参照可能（既存RLS）。
 *
 * レスポンス:
 * {
 *   athlete: { id, name, org_id, position, birth_date }
 *   kinematics_summary: [ { job_id, created_at, top_errors[], overall_score } ]
 *   fatigue_trend: [ { date, predicted_fatigue_state, fatigue_probability_high } ]
 *   cv_history: [ { id, status, created_at, masked_s3_key } ] (直近10件)
 * }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function getDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // ── 選手レコードを auth_user_id で特定 ──────────────────────────────────────
  const { data: athlete } = await db
    .from("athletes")
    .select("id, name, org_id, position, birth_date")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!athlete) {
    // スタッフの場合は 404 を返す（選手専用エンドポイント）
    return NextResponse.json({ error: "Athlete record not found for this user" }, { status: 404 });
  }

  // ── キネマティクス解析サマリ（直近5件） ─────────────────────────────────────
  const { data: kinematicsRows } = await db
    .from("kinematics_results")
    .select(`
      id,
      job_id,
      top_errors,
      kinematics_errors,
      created_at
    `)
    .eq("athlete_id", athlete.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const kinematics_summary = (kinematicsRows ?? []).map((row) => {
    const errors = (row.top_errors ?? []) as Array<{
      error_type: string;
      severity: number;
      description: string;
    }>;
    // 重症度平均からスコアを算出（0〜100, 高いほど良い）
    const avgSeverity =
      errors.length > 0
        ? errors.reduce((sum, e) => sum + e.severity, 0) / errors.length
        : 0;
    const overall_score = Math.max(0, Math.round(100 - avgSeverity * 10));
    return {
      job_id: row.job_id,
      created_at: row.created_at,
      top_errors: errors.slice(0, 5),
      overall_score,
    };
  });

  // ── 疲労スコアトレンド（直近30日） ─────────────────────────────────────────
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: fatigueRows } = await db
    .from("dbn_predictions")
    .select("prediction_date, predicted_fatigue_state, fatigue_probability_high, fatigue_probability_medium, fatigue_probability_low")
    .eq("athlete_id", athlete.id)
    .gte("prediction_date", thirtyDaysAgo.toISOString().slice(0, 10))
    .order("prediction_date", { ascending: true });

  // ── CV解析履歴（直近10件） ─────────────────────────────────────────────────
  const { data: cvJobs } = await db
    .from("cv_jobs")
    .select("id, status, created_at, masked_s3_key, rejection_reason")
    .eq("athlete_id", athlete.id)
    .order("created_at", { ascending: false })
    .limit(10);

  // ── アクティブな疲労アラート ──────────────────────────────────────────────
  const { data: activeAlerts } = await db
    .from("fatigue_alerts")
    .select("id, alert_date, predicted_fatigue_state, alert_status, recommended_action")
    .eq("athlete_id", athlete.id)
    .eq("alert_status", "pending")
    .order("alert_date", { ascending: false })
    .limit(3);

  return NextResponse.json({
    athlete: {
      id: athlete.id,
      name: athlete.name,
      org_id: athlete.org_id,
      position: athlete.position,
      birth_date: athlete.birth_date,
    },
    kinematics_summary,
    fatigue_trend: fatigueRows ?? [],
    cv_history: cvJobs ?? [],
    active_alerts: activeAlerts ?? [],
  });
}
