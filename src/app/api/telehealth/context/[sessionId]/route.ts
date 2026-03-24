/**
 * GET /api/telehealth/context/[sessionId]
 *
 * TeleHealth 通話中コンテキスト共有 API (P6-007)
 * セッションの選手に紐づくSOAPノート・アセスメント結果を返す。
 *
 * - スタッフのみアクセス可（選手は自分のデータのみ後日拡張）
 * - 直近 3 件の SOAP ノート
 * - 直近 3 件の完了済みアセスメント（primary_diagnosis + differentials）
 * - 当日の athlete_condition_cache（ACWR / readiness）
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  try {
    // ── スタッフ認証 ────────────────────────────────────────────────────────
    const supabaseAuth = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    const { data: staff } = await db
      .from("staff")
      .select("id, org_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!staff) {
      return NextResponse.json({ error: "Staff record not found" }, { status: 403 });
    }

    const { sessionId } = await params;

    // ── セッション取得（同組織チェック）──────────────────────────────────────
    const { data: session, error: sessionError } = await db
      .from("telehealth_sessions")
      .select("id, athlete_id, org_id, status, scheduled_at")
      .eq("id", sessionId)
      .eq("org_id", staff.org_id)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const athleteId = session.athlete_id;

    // ── 並行データ取得 ────────────────────────────────────────────────────────
    const [soapResult, assessmentResult, conditionResult, athleteResult] =
      await Promise.all([
        // 直近 3 件のSOAPノート
        db
          .from("soap_notes")
          .select("id, s_text, o_text, a_text, p_text, ai_assisted, created_at, updated_at")
          .eq("athlete_id", athleteId)
          .order("created_at", { ascending: false })
          .limit(3),

        // 直近 3 件の完了済みアセスメント
        db
          .from("assessments")
          .select(
            "id, assessment_type, status, primary_diagnosis, differentials, completed_at, started_at"
          )
          .eq("athlete_id", athleteId)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(3),

        // 直近 7 日のコンディションキャッシュ
        db
          .from("athlete_condition_cache")
          .select("date, acwr, readiness_score, fitness, fatigue, daily_load")
          .eq("athlete_id", athleteId)
          .order("date", { ascending: false })
          .limit(7),

        // 選手基本情報
        db
          .from("athletes")
          .select("id, name, position, jersey_number")
          .eq("id", athleteId)
          .maybeSingle(),
      ]);

    return NextResponse.json({
      session: {
        id: session.id,
        status: session.status,
        scheduled_at: session.scheduled_at,
      },
      athlete: athleteResult.data ?? null,
      soap_notes: soapResult.data ?? [],
      assessments: assessmentResult.data ?? [],
      condition_history: conditionResult.data ?? [],
    });
  } catch (err) {
    console.error("[telehealth/context] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
