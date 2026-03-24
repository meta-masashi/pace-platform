/**
 * GET  /api/imu   — IMUデバイス一覧取得
 * POST /api/imu   — IMUセッションデータ受信・ACWR統合 (P6-034)
 *
 * モバイルアプリが BLE 計測後にセッションデータを送信する。
 * PlayerLoad を daily_load として athlete_condition_cache に反映する。
 *
 * リクエスト: {
 *   device_id: string,          // imu_devices.id
 *   athlete_id: string,
 *   session_date: string,        // YYYY-MM-DD
 *   started_at: string,          // ISO8601
 *   ended_at?: string,
 *   player_load?: number,
 *   avg_hr?: number,
 *   max_hr?: number,
 *   hrv_rmssd?: number,
 *   steps?: number,
 *   distance_m?: number,
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function getDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// GET: IMUデバイス一覧（自組織）
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();

  // スタッフ or 選手を確認
  const [staffRes, athleteRes] = await Promise.all([
    db.from("staff").select("id, org_id").eq("id", user.id).maybeSingle(),
    db.from("athletes").select("id, org_id").eq("id", user.id).maybeSingle(),
  ]);

  const orgId = staffRes.data?.org_id ?? athleteRes.data?.org_id;
  if (!orgId) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { data, error } = await db
    .from("imu_devices")
    .select("id, athlete_id, device_name, device_id, vendor, model, is_active, paired_at, last_seen_at, athletes(name)")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("paired_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ devices: data ?? [] });
}

// ---------------------------------------------------------------------------
// POST: IMUセッションデータ受信 + ACWR 統合
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb();

    const [staffRes, athleteRes] = await Promise.all([
      db.from("staff").select("id, org_id").eq("id", user.id).maybeSingle(),
      db.from("athletes").select("id, org_id").eq("id", user.id).maybeSingle(),
    ]);

    const orgId = staffRes.data?.org_id ?? athleteRes.data?.org_id;
    if (!orgId) return NextResponse.json({ error: "User not found" }, { status: 403 });

    let body: {
      device_id?: string;
      athlete_id?: string;
      session_date?: string;
      started_at?: string;
      ended_at?: string;
      player_load?: number;
      avg_hr?: number;
      max_hr?: number;
      hrv_rmssd?: number;
      steps?: number;
      distance_m?: number;
    };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { device_id, athlete_id, session_date, started_at, player_load } = body;

    if (!device_id || !athlete_id || !session_date || !started_at) {
      return NextResponse.json(
        { error: "device_id, athlete_id, session_date, started_at are required" },
        { status: 400 }
      );
    }

    // デバイス検証
    const { data: device } = await db
      .from("imu_devices")
      .select("id")
      .eq("id", device_id)
      .eq("athlete_id", athlete_id)
      .eq("org_id", orgId)
      .maybeSingle();

    if (!device) {
      return NextResponse.json({ error: "Device not found or not authorized" }, { status: 404 });
    }

    // ── imu_sessions INSERT ──────────────────────────────────────────────────
    const { data: imuSession, error: insertError } = await db
      .from("imu_sessions")
      .insert({
        org_id: orgId,
        athlete_id,
        device_id,
        session_date,
        started_at,
        ended_at: body.ended_at ?? null,
        player_load: player_load ?? null,
        avg_hr: body.avg_hr ?? null,
        max_hr: body.max_hr ?? null,
        hrv_rmssd: body.hrv_rmssd ?? null,
        steps: body.steps ?? null,
        distance_m: body.distance_m ?? null,
        integrated_to_acwr: false,
      })
      .select("id")
      .single();

    if (insertError || !imuSession) {
      return NextResponse.json({ error: "Failed to save IMU session" }, { status: 500 });
    }

    // ── ACWR 統合: PlayerLoad → daily_load として athlete_condition_cache を更新 (P6-034)
    let acwrIntegrated = false;
    if (player_load != null && player_load > 0) {
      const { data: existingCache } = await db
        .from("athlete_condition_cache")
        .select("id, daily_load")
        .eq("athlete_id", athlete_id)
        .eq("date", session_date)
        .maybeSingle();

      if (existingCache) {
        // 既存エントリがある場合は daily_load を加算
        const newLoad = (existingCache.daily_load ?? 0) + player_load;
        await db
          .from("athlete_condition_cache")
          .update({ daily_load: newLoad })
          .eq("id", existingCache.id);
      } else {
        // 新規エントリ作成（EWMA は条件キャッシュ更新ジョブが再計算する）
        await db
          .from("athlete_condition_cache")
          .insert({
            athlete_id,
            date: session_date,
            daily_load: player_load,
            // fitness / fatigue / acwr / readiness_score は EWMA ジョブが補完
          });
      }

      // imu_sessions を統合済みに更新
      await db
        .from("imu_sessions")
        .update({ integrated_to_acwr: true, acwr_date: session_date })
        .eq("id", imuSession.id);

      // デバイスの last_seen_at 更新
      await db
        .from("imu_devices")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", device_id);

      acwrIntegrated = true;
    }

    return NextResponse.json(
      {
        session_id: imuSession.id,
        acwr_integrated: acwrIntegrated,
        message: acwrIntegrated
          ? "IMUセッションを記録し、ACWR計算用データに統合しました"
          : "IMUセッションを記録しました（PlayerLoadなし、ACWR統合スキップ）",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[imu] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
