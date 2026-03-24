/**
 * GET /api/telehealth/sessions
 *
 * スタッフ組織の telehealth_sessions 一覧を返す。
 * 選手名（athletes テーブル）を結合して返す。
 *
 * Phase 6 Sprint 1
 *
 * 認証: スタッフのみ
 * クエリパラメータ: ?status=scheduled|active|completed
 * レスポンス: { sessions: Session[] }
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

const ALLOWED_STATUSES = ["scheduled", "active", "completed"] as const;
type SessionStatus = (typeof ALLOWED_STATUSES)[number];

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // ── スタッフ認証 ──────────────────────────────────────────────────────────
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

    const db = getDb();

    // スタッフレコードと org_id 取得
    const { data: staff, error: staffError } = await db
      .from("staff")
      .select("id, org_id, role")
      .eq("id", userId)
      .maybeSingle();

    if (staffError || !staff) {
      return NextResponse.json(
        { error: "Staff record not found" },
        { status: 403 }
      );
    }

    // ── クエリパラメータ ──────────────────────────────────────────────────────
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");

    let statusFilter: SessionStatus | null = null;
    if (statusParam) {
      if (!ALLOWED_STATUSES.includes(statusParam as SessionStatus)) {
        return NextResponse.json(
          {
            error: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(", ")}`,
          },
          { status: 400 }
        );
      }
      statusFilter = statusParam as SessionStatus;
    }

    // ── telehealth_sessions 取得（選手名結合）────────────────────────────────
    let query = db
      .from("telehealth_sessions")
      .select(
        `
        id,
        room_name,
        room_url,
        staff_id,
        athlete_id,
        org_id,
        scheduled_at,
        notes,
        status,
        created_at,
        athletes (
          id,
          name,
          position
        )
      `
      )
      .eq("org_id", staff.org_id)
      .order("scheduled_at", { ascending: false });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data: sessions, error: queryError } = await query;

    if (queryError) {
      console.error("[telehealth/sessions] DB query error:", queryError);
      return NextResponse.json(
        { error: "Failed to fetch sessions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ sessions: sessions ?? [] });
  } catch (err) {
    console.error("[telehealth/sessions] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
