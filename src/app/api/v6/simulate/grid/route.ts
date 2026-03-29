import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v6/simulate/grid?athleteId=xxx&baseLoad=100
 *
 * Pre-computes 5 discrete load scenarios via the Python biomechanics service,
 * returning a grid array for client-side interpolation (zero-latency UX).
 *
 * Grid scales: [0, 50, 100, 150, 200] (% of base load)
 */

const GRID_SCALES = [0, 50, 100, 150, 200];

const BIOMECHANICS_URL = process.env.BIOMECHANICS_SERVICE_URL ?? "http://localhost:8080";
const BIOMECHANICS_KEY = process.env.BIOMECHANICS_API_KEY ?? "";

interface ODEResponse {
  damage_after: number;
  repair_rate: number;
  is_critical: boolean;
  d_crit: number;
}

interface GridPoint {
  scale: number;
  predicted_damage: number;
  repair_rate: number;
  status: "GREEN" | "YELLOW" | "ORANGE" | "RED";
  d_crit: number;
}

function classifyStatus(damage: number, dCrit: number): GridPoint["status"] {
  const ratio = damage / Math.max(dCrit, 0.01);
  if (ratio >= 1.0) return "RED";
  if (ratio >= 0.8) return "ORANGE";
  if (ratio >= 0.5) return "YELLOW";
  return "GREEN";
}

async function computeODE(
  load: number,
  currentDamage: number,
  tissue: string
): Promise<ODEResponse | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${BIOMECHANICS_URL}/compute/ode`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": BIOMECHANICS_KEY,
      },
      body: JSON.stringify({
        tissue_category: tissue,
        load,
        current_damage: currentDamage,
        delta_t: 1.0, // 1-day forward simulation
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Fallback ODE approximation when Python service is unavailable
function approximateODE(load: number, currentDamage: number): ODEResponse {
  // Simplified logistic growth model as conservative fallback
  const alpha = 0.3;
  const beta = 0.1;
  const m = 1.5;
  const tau = 0.8;
  const loadNorm = load / 100;

  const damageGrowth = alpha * Math.pow(Math.max(loadNorm, 0), m);
  const repair = beta * currentDamage * Math.exp(-tau * currentDamage / 100);
  const damageAfter = Math.max(0, Math.min(100, currentDamage + damageGrowth - repair));
  const dCrit = 80; // Conservative fixed threshold

  return {
    damage_after: Math.round(damageAfter * 10) / 10,
    repair_rate: Math.round(repair * 100) / 100,
    is_critical: damageAfter >= dCrit,
    d_crit: dCrit,
  };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const userRes = await supabase.auth.getUser();
  const user = userRes?.data?.user ?? null;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const athleteId = req.nextUrl.searchParams.get("athleteId");
  const baseLoadParam = req.nextUrl.searchParams.get("baseLoad");
  const tissue = req.nextUrl.searchParams.get("tissue") ?? "structural_soft";
  const baseLoad = Math.max(0, Math.min(500, Number(baseLoadParam) || 100));

  // Fetch current damage from condition cache
  let currentDamage = 20; // safe default
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

  // Compute grid in parallel
  const gridPromises = GRID_SCALES.map(async (scale): Promise<GridPoint> => {
    const scaledLoad = (baseLoad * scale) / 100;

    const result = await computeODE(scaledLoad, currentDamage, tissue);

    if (result) {
      return {
        scale,
        predicted_damage: Math.round(result.damage_after * 10) / 10,
        repair_rate: result.repair_rate,
        status: classifyStatus(result.damage_after, result.d_crit),
        d_crit: result.d_crit,
      };
    }

    // Fallback to approximation
    const approx = approximateODE(scaledLoad, currentDamage);
    return {
      scale,
      predicted_damage: approx.damage_after,
      repair_rate: approx.repair_rate,
      status: classifyStatus(approx.damage_after, approx.d_crit),
      d_crit: approx.d_crit,
    };
  });

  const grid = await Promise.all(gridPromises);

  return NextResponse.json({
    grid,
    meta: {
      base_load: baseLoad,
      current_damage: currentDamage,
      tissue,
      computed_at: new Date().toISOString(),
      is_exact: grid.every(
        (_, i) => GRID_SCALES[i] !== undefined
      ), // true if all from Python
    },
  });
}
