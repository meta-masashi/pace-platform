/**
 * POST /api/telehealth/create-room
 *
 * Daily.co API でビデオルームを作成し、telehealth_sessions に INSERT する。
 *
 * Phase 6 Sprint 1 ADR-027: 録画禁止（enable_recording: 'off'）
 *
 * リクエスト: { athlete_id: string, scheduled_at: string, notes?: string }
 * レスポンス: { session_id: string, room_url: string, room_name: string }
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

interface DailyRoom {
  id: string;
  name: string;
  url: string;
}

async function createDailyRoom(): Promise<DailyRoom> {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) {
    throw new Error("DAILY_API_KEY is not configured");
  }

  const res = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      privacy: "private",
      properties: {
        // ADR-027: 録画禁止
        enable_recording: "off",
      },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "(no body)");
    throw new Error(`Daily.co room creation failed: ${res.status} ${errorBody}`);
  }

  const data = (await res.json()) as DailyRoom;
  return data;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ── スタッフ認証 ──────────────────────────────────────────────────────────
    const supabaseAuth = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    // スタッフレコードと org_id 取得
    const { data: staff, error: staffError } = await db
      .from("staff")
      .select("id, org_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (staffError || !staff) {
      return NextResponse.json(
        { error: "Staff record not found" },
        { status: 403 }
      );
    }

    // ── リクエストボディ ──────────────────────────────────────────────────────
    let body: { athlete_id?: string; scheduled_at?: string; notes?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { athlete_id, scheduled_at, notes } = body;

    if (!athlete_id || !scheduled_at) {
      return NextResponse.json(
        { error: "athlete_id and scheduled_at are required" },
        { status: 400 }
      );
    }

    // 選手が同じ org に所属していることを確認
    const { data: athlete } = await db
      .from("athletes")
      .select("id")
      .eq("id", athlete_id)
      .eq("org_id", staff.org_id)
      .maybeSingle();

    if (!athlete) {
      return NextResponse.json(
        { error: "Athlete not found in your organization" },
        { status: 404 }
      );
    }

    // ── Daily.co ルーム作成 ───────────────────────────────────────────────────
    let room: DailyRoom;
    try {
      room = await createDailyRoom();
    } catch (err) {
      console.error("[telehealth/create-room] Daily.co error:", err);
      return NextResponse.json(
        { error: "Failed to create video room" },
        { status: 502 }
      );
    }

    // ── telehealth_sessions INSERT ────────────────────────────────────────────
    const { data: session, error: insertError } = await db
      .from("telehealth_sessions")
      .insert({
        room_name: room.name,
        room_url: room.url,
        staff_id: staff.id,
        athlete_id,
        org_id: staff.org_id,
        scheduled_at,
        notes: notes?.trim() || null,
        status: "scheduled",
      })
      .select("id")
      .single();

    if (insertError || !session) {
      console.error("[telehealth/create-room] DB insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to save session record" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        session_id: session.id,
        room_url: room.url,
        room_name: room.name,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[telehealth/create-room] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
