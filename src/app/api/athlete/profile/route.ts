import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://athlete.hachi-riskon.com",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

// Lazy-init to avoid build-time error (env vars not available at module load)
let _serviceSupabase: ReturnType<typeof createServiceClient> | null = null;
function getServiceClient() {
  if (!_serviceSupabase) {
    _serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _serviceSupabase;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }

    const supabaseAuth = await createClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }

    const result = await getServiceClient()
      .from("athletes")
      .select("id, name, position, number, team_id, teams(name)")
      .eq("id", user.id)
      .maybeSingle();

    if (result.error) {
      console.error("[athlete/profile] DB error:", result.error);
      return NextResponse.json({ error: String(result.error.message) }, { status: 500, headers: CORS_HEADERS });
    }

    if (!result.data) {
      return NextResponse.json({ error: "Athlete not found" }, { status: 404, headers: CORS_HEADERS });
    }

    const athlete = result.data as Record<string, unknown>;
    return NextResponse.json({
      id: athlete.id,
      name: athlete.name,
      position: athlete.position ?? "",
      number: athlete.number,
      team_name: (athlete.teams as Record<string, unknown> | null)?.name ?? "",
    }, { headers: CORS_HEADERS });
  } catch (e) {
    console.error("[athlete/profile] Unexpected error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS_HEADERS });
  }
}
