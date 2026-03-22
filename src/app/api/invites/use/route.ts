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

interface UseInviteBody {
  code: string;
  athlete_id: string;
  name: string;
  position?: string;
}

// POST /api/invites/use — Mark invite as used and create athlete record
export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = (await request.json()) as UseInviteBody;
    const { code, athlete_id, name, position } = body;

    if (!code || !athlete_id || !name) {
      return NextResponse.json(
        { error: "code, athlete_id, and name are required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const { data: invite, error: lookupError } = await supabase
      .from("athlete_invites")
      .select("id, org_id, team_id")
      .eq("code", code)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (lookupError || !invite) {
      return NextResponse.json(
        { error: "招待コードが無効か期限切れです" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const { org_id, team_id } = invite;

    const { error: athleteError } = await supabase.from("athletes").insert({
      id: athlete_id,
      org_id,
      team_id,
      name,
      position: position ?? "",
    });

    if (athleteError) {
      console.error("[api/invites/use POST] athlete insert:", athleteError);
      return NextResponse.json(
        { error: "Failed to create athlete record" },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    await supabase
      .from("athlete_invites")
      .update({
        used_at: new Date().toISOString(),
        used_by_athlete_id: athlete_id,
      })
      .eq("id", invite.id);

    return NextResponse.json({ success: true, athlete_id, team_id }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("[api/invites/use POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS_HEADERS });
  }
}
