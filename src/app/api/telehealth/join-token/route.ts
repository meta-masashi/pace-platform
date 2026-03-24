/**
 * POST /api/telehealth/join-token
 *
 * Daily.co meeting token を発行し、telehealth_consent_records に UPSERT する。
 *
 * Phase 6 Sprint 1 ADR-027: enable_recording: false
 *
 * 認証: スタッフ OR 選手（athletes.id = auth.uid() も許可）
 * リクエスト: { session_id: string, role: 'staff' | 'athlete' }
 * レスポンス: { token: string, room_url: string }
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

interface DailyMeetingToken {
  token: string;
}

async function createDailyMeetingToken(
  roomName: string,
  isOwner: boolean
): Promise<string> {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) {
    throw new Error("DAILY_API_KEY is not configured");
  }

  const res = await fetch("https://api.daily.co/v1/meeting-tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        is_owner: isOwner,
        // ADR-027: 録画禁止
        enable_recording: false,
      },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "(no body)");
    throw new Error(`Daily.co token creation failed: ${res.status} ${errorBody}`);
  }

  const data = (await res.json()) as DailyMeetingToken;
  return data.token;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ── 認証（スタッフ OR 選手）────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    const supabaseAuth = await createClient();
    let userId: string;

    if (token) {
      const {
        data: { user },
        error,
      } = await supabaseAuth.auth.getUser(token);
      if (error || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = user.id;
    } else {
      const {
        data: { user },
      } = await supabaseAuth.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = user.id;
    }

    // ── リクエストボディ ──────────────────────────────────────────────────────
    let body: { session_id?: string; role?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { session_id, role } = body;

    if (!session_id || !role) {
      return NextResponse.json(
        { error: "session_id and role are required" },
        { status: 400 }
      );
    }

    if (role !== "staff" && role !== "athlete") {
      return NextResponse.json(
        { error: "role must be 'staff' or 'athlete'" },
        { status: 400 }
      );
    }

    const db = getDb();

    // ── セッション取得 ────────────────────────────────────────────────────────
    const { data: session, error: sessionError } = await db
      .from("telehealth_sessions")
      .select("id, room_name, room_url, staff_id, athlete_id, org_id, status")
      .eq("id", session_id)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // ── アクセス権チェック ────────────────────────────────────────────────────
    // スタッフか選手どちらかであることを確認
    const isStaff = await (async () => {
      const { data } = await db
        .from("staff")
        .select("id")
        .eq("id", userId)
        .eq("org_id", session.org_id)
        .maybeSingle();
      return !!data;
    })();

    const isAthlete = await (async () => {
      const { data } = await db
        .from("athletes")
        .select("id")
        .eq("id", session.athlete_id)
        .eq("id", userId)
        .maybeSingle();
      return !!data;
    })();

    if (!isStaff && !isAthlete) {
      return NextResponse.json(
        { error: "Forbidden: you are not a participant of this session" },
        { status: 403 }
      );
    }

    // ロールと実際の身元が一致しているか確認
    if (role === "staff" && !isStaff) {
      return NextResponse.json(
        { error: "Forbidden: role mismatch" },
        { status: 403 }
      );
    }
    if (role === "athlete" && !isAthlete) {
      return NextResponse.json(
        { error: "Forbidden: role mismatch" },
        { status: 403 }
      );
    }

    // ── Daily.co meeting token 発行 ───────────────────────────────────────────
    let meetingToken: string;
    try {
      meetingToken = await createDailyMeetingToken(
        session.room_name,
        role === "staff"
      );
    } catch (err) {
      console.error("[telehealth/join-token] Daily.co error:", err);
      return NextResponse.json(
        { error: "Failed to create meeting token" },
        { status: 502 }
      );
    }

    // ── telehealth_consent_records UPSERT ────────────────────────────────────
    const { error: consentError } = await db
      .from("telehealth_consent_records")
      .upsert(
        {
          session_id,
          user_id: userId,
          role,
          consented_at: new Date().toISOString(),
        },
        { onConflict: "session_id,user_id" }
      );

    if (consentError) {
      console.error("[telehealth/join-token] Consent upsert error:", consentError);
      // 同意記録失敗はトークン発行をブロックしない（ログのみ）
    }

    // ── 監査ログ (P6-012): token_issued イベント ─────────────────────────────
    const userAgent = req.headers.get("user-agent") ?? undefined;
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ipStr = forwardedFor?.split(",")[0]?.trim() ?? undefined;

    await db.from("telehealth_audit_log").insert({
      session_id,
      user_id: userId,
      user_role: role,
      event_type: "token_issued",
      user_agent: userAgent,
      ip_address: ipStr ?? null,
      metadata: {
        room_name: session.room_name,
        is_owner: role === "staff",
      },
    }).then(({ error }) => {
      if (error) console.error("[telehealth/join-token] Audit log error:", error.message);
    });

    return NextResponse.json({
      token: meetingToken,
      room_url: session.room_url,
    });
  } catch (err) {
    console.error("[telehealth/join-token] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
