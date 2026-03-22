import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://athlete.hachi-riskon.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// POST /api/invites/validate — Validate an invite code (no auth required)
export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await request.json();
    const { code } = body as { code: string };

    if (!code) {
      return NextResponse.json({ error: "code is required" }, { status: 400, headers: CORS_HEADERS });
    }

    const { data: invite, error } = await supabase
      .from("athlete_invites")
      .select(
        "org_id, team_id, athlete_name, teams(name), organizations(name)"
      )
      .eq("code", code)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !invite) {
      return NextResponse.json(
        { error: "招待コードが無効か期限切れです" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const teamsRaw = invite.teams as unknown;
    const orgsRaw = invite.organizations as unknown;
    const teams = Array.isArray(teamsRaw)
      ? (teamsRaw[0] as { name: string } | undefined) ?? null
      : (teamsRaw as { name: string } | null);
    const organizations = Array.isArray(orgsRaw)
      ? (orgsRaw[0] as { name: string } | undefined) ?? null
      : (orgsRaw as { name: string } | null);

    return NextResponse.json({
      valid: true,
      org_id: invite.org_id,
      team_id: invite.team_id,
      org_name: organizations?.name ?? null,
      team_name: teams?.name ?? null,
      athlete_name: invite.athlete_name ?? null,
    }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("[api/invites/validate POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS_HEADERS });
  }
}
