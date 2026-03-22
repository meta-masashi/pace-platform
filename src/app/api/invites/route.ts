import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/invites — List all invites for the current staff's team
export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get staff record to find team_id
    const { data: staffRecord, error: staffError } = await supabase
      .from("staff")
      .select("team_id")
      .eq("id", user.id)
      .single();

    if (staffError || !staffRecord) {
      return NextResponse.json({ error: "Staff record not found" }, { status: 404 });
    }

    const { team_id } = staffRecord;

    // Query invites joined with teams
    const { data: invites, error: invitesError } = await supabase
      .from("athlete_invites")
      .select(
        "code, athlete_name, expires_at, used_at, created_at, teams(name)"
      )
      .eq("team_id", team_id)
      .order("created_at", { ascending: false });

    if (invitesError) {
      console.error("[api/invites GET]", invitesError);
      return NextResponse.json({ error: "Failed to fetch invites" }, { status: 500 });
    }

    return NextResponse.json({ invites: invites ?? [] });
  } catch (err) {
    console.error("[api/invites GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/invites — Create a new invite code
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get staff's org_id and team_id
    const { data: staffRecord, error: staffError } = await supabase
      .from("staff")
      .select("org_id, team_id")
      .eq("id", user.id)
      .single();

    if (staffError || !staffRecord) {
      return NextResponse.json({ error: "Staff record not found" }, { status: 404 });
    }

    const { org_id, team_id } = staffRecord;

    const body = await request.json().catch(() => ({}));
    const athlete_name: string | undefined = body?.athlete_name;

    // Generate 8-char alphanumeric code
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();

    const { data: invite, error: insertError } = await supabase
      .from("athlete_invites")
      .insert({
        code,
        org_id,
        team_id,
        athlete_name: athlete_name ?? null,
        created_by: user.id,
      })
      .select("code, expires_at")
      .single();

    if (insertError || !invite) {
      console.error("[api/invites POST]", insertError);
      return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
    }

    return NextResponse.json({ code: invite.code, expires_at: invite.expires_at });
  } catch (err) {
    console.error("[api/invites POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
