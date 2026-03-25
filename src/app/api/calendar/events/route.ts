import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/calendar/events — Get synced calendar events with load prediction overlay
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: staff } = await supabase
    .from("staff")
    .select("id, team_id, organization_id")
    .eq("auth_user_id", user.id)
    .single();

  if (!staff?.team_id) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const daysAhead = Number(req.nextUrl.searchParams.get("days") ?? "30");
  const now = new Date();
  const futureDate = new Date(
    now.getTime() + daysAhead * 24 * 60 * 60 * 1000
  );

  // Fetch schedule events
  const { data: events, error } = await supabase
    .from("schedule_events")
    .select("*")
    .eq("team_id", staff.team_id)
    .gte("start_time", now.toISOString())
    .lte("start_time", futureDate.toISOString())
    .order("start_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get current team condition for load prediction
  const { data: conditionCache } = await supabase
    .from("athlete_condition_cache")
    .select("readiness_score, acwr, fitness_score, fatigue_score")
    .eq("organization_id", staff.organization_id);

  const athleteCount = conditionCache?.length ?? 0;
  const avgReadiness =
    athleteCount > 0
      ? (conditionCache?.reduce((s, a) => s + (a.readiness_score ?? 0), 0) ?? 0) /
        athleteCount
      : 0;
  const avgAcwr =
    athleteCount > 0
      ? (conditionCache?.reduce((s, a) => s + (a.acwr ?? 0), 0) ?? 0) /
        athleteCount
      : 0;

  // Simple load prediction: predict availability based on event type and current ACWR
  const eventsWithPrediction = (events ?? []).map((event) => {
    let predictedAvailability = 100;
    const eventType = event.event_type;

    // Base availability reduction by event type
    if (eventType === "match") {
      predictedAvailability = Math.max(
        50,
        Math.round(avgReadiness * 0.9)
      );
    } else if (eventType === "high_intensity") {
      predictedAvailability = Math.max(
        60,
        Math.round(avgReadiness * 0.95)
      );
    } else if (eventType === "rest") {
      predictedAvailability = Math.min(100, Math.round(avgReadiness + 10));
    } else {
      predictedAvailability = Math.round(avgReadiness);
    }

    // ACWR penalty
    if (avgAcwr > 1.5) {
      predictedAvailability = Math.max(
        40,
        Math.round(predictedAvailability * 0.8)
      );
    } else if (avgAcwr > 1.3) {
      predictedAvailability = Math.max(
        50,
        Math.round(predictedAvailability * 0.9)
      );
    }

    return {
      ...event,
      predicted_availability: Math.round(
        Math.max(0, Math.min(100, predictedAvailability))
      ),
    };
  });

  return NextResponse.json({
    events: eventsWithPrediction,
    team_snapshot: {
      avg_readiness: Math.round(avgReadiness),
      avg_acwr: Math.round(avgAcwr * 100) / 100,
      athlete_count: athleteCount,
    },
  });
}
