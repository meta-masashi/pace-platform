import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/v6/simulate/exact
 * Body: { athleteId, load, tissue }
 *
 * Called on slider commit (onPointerUp) for RK45 exact solution.
 * Returns precise damage prediction to replace interpolated estimate.
 */

const BIOMECHANICS_URL = process.env.BIOMECHANICS_SERVICE_URL ?? "http://localhost:8080";
const BIOMECHANICS_KEY = process.env.BIOMECHANICS_API_KEY ?? "";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const userRes = await supabase.auth.getUser();
  const user = userRes?.data?.user ?? null;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { athleteId, load, tissue } = body;

  if (load == null) {
    return NextResponse.json({ error: "load required" }, { status: 400 });
  }

  // Safety clamp: server-side double check
  const clampedLoad = Math.max(0, Math.min(500, Number(load)));
  const tissueType = tissue ?? "structural_soft";

  // Fetch current damage
  let currentDamage = 20;
  if (athleteId) {
    const { data: cache } = await supabase
      .from("athlete_condition_cache")
      .select("fatigue_score")
      .eq("athlete_id", athleteId)
      .single();

    if (cache?.fatigue_score != null) {
      currentDamage = cache.fatigue_score;
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${BIOMECHANICS_URL}/compute/ode`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": BIOMECHANICS_KEY,
      },
      body: JSON.stringify({
        tissue_category: tissueType,
        load: clampedLoad,
        current_damage: currentDamage,
        delta_t: 1.0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: "Biomechanics service error", fallback: true },
        { status: 502 }
      );
    }

    const result = await res.json();
    const damageAfter = Number.isFinite(result.damage_after) ? result.damage_after : 0;
    const dCrit = Number.isFinite(result.d_crit) ? result.d_crit : 80;
    const ratio = damageAfter / Math.max(dCrit, 0.01);

    let status: string;
    if (ratio >= 1.0) status = "RED";
    else if (ratio >= 0.8) status = "ORANGE";
    else if (ratio >= 0.5) status = "YELLOW";
    else status = "GREEN";

    return NextResponse.json({
      predicted_damage: Math.round(damageAfter * 10) / 10,
      repair_rate: result.repair_rate,
      status,
      d_crit: dCrit,
      is_exact: true,
      simulation_points: result.simulation_points ?? [],
      computed_at: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "Biomechanics service timeout", fallback: true },
      { status: 504 }
    );
  }
}
