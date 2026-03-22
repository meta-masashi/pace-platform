import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Service role client — bypasses RLS entirely
const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // 1. Validate the athlete's auth token
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAuth = await createClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse body
    const body = await req.json();
    const { nrs, sleep_score, subjective_condition, memo } = body;

    const today = new Date().toISOString().slice(0, 10);
    const hp_computed = Math.min(
      100,
      (10 - (nrs ?? 0)) * 5 + (sleep_score ?? 3) * 5 + (subjective_condition ?? 3) * 5
    );

    // 3. Upsert using service role (bypasses RLS — athlete identity validated above)
    const { error: dbError } = await serviceSupabase
      .from("daily_metrics")
      .upsert(
        {
          athlete_id: user.id,
          date: today,
          nrs: nrs ?? 0,
          sleep_score: sleep_score ?? 3,
          subjective_condition: subjective_condition ?? 3,
          memo: memo?.trim() || null,
          hp_computed,
        },
        { onConflict: "athlete_id,date" }
      );

    if (dbError) {
      console.error("[checkin] DB error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, hp_computed });
  } catch (e) {
    console.error("[checkin] Unexpected error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET: check if today already submitted
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAuth = await createClient();
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await serviceSupabase
    .from("daily_metrics")
    .select("id, nrs, sleep_score, subjective_condition, memo")
    .eq("athlete_id", user.id)
    .eq("date", today)
    .maybeSingle();

  return NextResponse.json({ submitted: !!data, data: data ?? null });
}
