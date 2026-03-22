import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAuth = await createClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: athlete, error } = await serviceSupabase
      .from("athletes")
      .select("id, name, position, number, team_id, teams(name)")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[athlete/profile] DB error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!athlete) {
      return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: athlete.id,
      name: athlete.name,
      position: athlete.position ?? "",
      number: athlete.number,
      team_name: (athlete as any).teams?.name ?? "",
    });
  } catch (e) {
    console.error("[athlete/profile] Unexpected error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
