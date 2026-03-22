import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  // Verify auth with the anon client
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get staff record to find team_id
  const { data: staff } = await supabase
    .from("staff")
    .select("id, team_id, org_id")
    .eq("id", user.id)
    .single();

  if (!staff?.team_id) {
    return NextResponse.json({ error: "Team not found" }, { status: 400 });
  }

  const body = await req.json();
  const { title, event_type, starts_at, ends_at, location, description } = body;

  if (!title || !event_type || !starts_at) {
    return NextResponse.json({ error: "title, event_type, starts_at are required" }, { status: 400 });
  }

  // Use service role for the insert to bypass RLS
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await serviceClient
    .from("schedule_events")
    .insert({
      team_id: staff.team_id,
      created_by_staff_id: user.id,
      title,
      event_type,
      start_time: starts_at,
      end_time: ends_at || starts_at,
      location: location || null,
      notes: description || null,
    })
    .select()
    .single();

  if (error) {
    console.error("[schedule-events POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
