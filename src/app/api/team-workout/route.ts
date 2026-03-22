import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Workout, WorkoutItem } from "@/types";
import { checkRateLimit, extractUserId } from "@/lib/rate-limit";
import { validateHardLocks } from "@/lib/hard-lock";
import { createClient } from "@/lib/supabase/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const CDS_DISCLAIMER =
  "※ このチームトレーニングメニューはAI生成による臨床意思決定支援情報です。医療専門家・S&Cコーチによる判断を優先し、最終承認は必ず担当スタッフが行ってください。";

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

interface LockedAthlete {
  athlete_id: string;
  /** Exercise tags that are hard-locked for this athlete */
  tags: string[];
}

interface TeamWorkoutRequest {
  team_id: string;
  /** Acute:Chronic Workload Ratio for the team (e.g. 1.2) */
  acwr: number;
  /** Current mesocycle phase: "accumulation" | "intensification" | "realization" | "recovery" */
  mesocycle_phase: "accumulation" | "intensification" | "realization" | "recovery";
  /** Athletes with active restrictions */
  locked_athletes?: LockedAthlete[];
}

interface GeneratedBlock {
  block_name: string;
  duration_min: number;
  exercises: Array<{
    exercise_name: string;
    sets: number;
    reps_or_time: string;
    unit: "reps" | "sec" | "min";
    rpe?: number;
    cues?: string;
    reason: string;
    contraindication_tags?: string[];
  }>;
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildTeamWorkoutPrompt(
  req: TeamWorkoutRequest,
  filteredTags: string[],
  retryHint = false
): string {
  const phaseGuidelines: Record<TeamWorkoutRequest["mesocycle_phase"], string> = {
    accumulation:
      "蓄積期（Accumulation）: ボリューム最大化・基礎体力向上。RPE 6-7。",
    intensification:
      "強化期（Intensification）: 強度向上・神経筋適応。RPE 7-8。",
    realization:
      "実現期（Realization）: 競技特異的動作・ピーク発揮。RPE 8-9。",
    recovery:
      "回復期（Recovery）: 疲労回復・モビリティ維持。RPE 4-5。低強度のみ。",
  };

  const acwrComment =
    req.acwr > 1.5
      ? `⚠ ACWR ${req.acwr} は危険域（>1.5）です。ボリュームを大幅に削減し、回復系エクササイズを優先してください。`
      : req.acwr > 1.3
      ? `注意: ACWR ${req.acwr} はやや高め（1.3-1.5）。強度は控えめに設定してください。`
      : req.acwr < 0.8
      ? `注意: ACWR ${req.acwr} は低め（<0.8）。ディトレーニングリスクあり。適切な刺激を加えてください。`
      : `ACWR ${req.acwr} は適正範囲内です。`;

  const retryPrefix = retryHint
    ? `【重要】前回の出力がJSON形式ではありませんでした。今回は必ずJSON配列のみを出力してください。説明文・マークダウン・コードブロックは一切不要です。\n\n`
    : "";

  const lockedTagsSummary =
    filteredTags.length > 0
      ? filteredTags.map((t) => `- ${t}`).join("\n")
      : "なし";

  return `${retryPrefix}あなたはスポーツ医学・S&Cの専門家AIです。
チーム全体の120分トレーニングメニューを日本語でJSON形式で作成してください。

## チーム状態
- ACWR: ${req.acwr}（${acwrComment}）
- メソサイクルフェーズ: ${phaseGuidelines[req.mesocycle_phase]}

## チーム全体の除外タグ（Hard Lock — 1名以上の選手が禁止）
以下のタグに該当するエクササイズはチーム全体のメニューに含めないこと:
${lockedTagsSummary}

## 構成（5ブロック合計120分）
1. ウォームアップ（15分）
2. テクニカル / アクティベーション（20分）
3. メインセッション（40分）
4. コンディショニング（25分）
5. クールダウン / ストレッチ（20分）

## 出力形式
必ず以下のJSON配列（5要素）のみを出力してください（コードブロックや説明文は不要）:
[
  {
    "block_name": "ウォームアップ",
    "duration_min": 15,
    "exercises": [
      {
        "exercise_name": "エクササイズ名（日本語）",
        "sets": 数値,
        "reps_or_time": "回数または時間を文字列で",
        "unit": "reps" | "sec" | "min",
        "rpe": 数値（6-20スケール、省略可）,
        "cues": "実施上の注意点（省略可）",
        "reason": "選択理由",
        "contraindication_tags": ["除外タグ"]
      }
    ]
  }
]`.trim();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip markdown code fences and return cleaned JSON text */
function cleanJsonText(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** Fallback workout returned when all retries fail */
function buildFallbackWorkout(teamId: string): Workout {
  const now = new Date().toISOString();
  const menu: WorkoutItem[] = [
    {
      exercise_id: `fallback-team-${Date.now()}-0`,
      exercise_name: "ジョグ（軽め）",
      sets: 1,
      reps_or_time: "10",
      unit: "min",
      reason: "AI生成失敗のため安全なフォールバックメニューを提供",
      block: "ウォームアップ",
    },
    {
      exercise_id: `fallback-team-${Date.now()}-1`,
      exercise_name: "静的ストレッチ",
      sets: 1,
      reps_or_time: "15",
      unit: "min",
      reason: "基本的なコンディショニング",
      block: "クールダウン",
    },
  ];

  return {
    id: `workout-team-fallback-${Date.now()}`,
    team_id: teamId,
    type: "team",
    generated_by_ai: true,
    generated_at: now,
    menu,
    total_duration_min: 25,
    notes: `${CDS_DISCLAIMER}\n\n⚠ AI生成に失敗したため、安全なフォールバックメニューを返しています。手動でメニューを作成してください。`,
  };
}

/** Call Gemini with retry on JSON parse failure */
async function generateWithRetry(
  req: TeamWorkoutRequest,
  filteredTags: string[],
  maxRetries = 2
): Promise<GeneratedBlock[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prompt = buildTeamWorkoutPrompt(req, filteredTags, attempt > 0);

    try {
      const result = await model.generateContent(prompt);
      const rawText = result.response.text().trim();
      const jsonText = cleanJsonText(rawText);
      const parsed = JSON.parse(jsonText);

      if (!Array.isArray(parsed)) {
        throw new Error("Response is not a JSON array");
      }

      return parsed as GeneratedBlock[];
    } catch (err) {
      lastError = err;
      console.warn(
        `[team-workout] JSON parse attempt ${attempt + 1} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.error("[team-workout] All Gemini retries exhausted:", lastError);
  throw new Error("GEMINI_PARSE_EXHAUSTED");
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ─────────────────────────────────────────────────────────
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // ── Rate limiting ──────────────────────────────────────────────────────
    const userId = extractUserId(request);
    const rl = await checkRateLimit(userId, "team-workout");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "レート制限: 1分あたり10回まで。しばらく待ってから再試行してください。" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rl.resetAt),
            "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const body = (await request.json()) as TeamWorkoutRequest;
    const { team_id, acwr, mesocycle_phase, locked_athletes } = body;

    // ── Input validation ───────────────────────────────────────────────────
    if (!team_id) {
      return NextResponse.json({ error: "team_id is required" }, { status: 400 });
    }
    if (acwr === undefined || acwr === null || typeof acwr !== "number") {
      return NextResponse.json({ error: "acwr (number) is required" }, { status: 400 });
    }
    const validPhases = ["accumulation", "intensification", "realization", "recovery"];
    if (!mesocycle_phase || !validPhases.includes(mesocycle_phase)) {
      return NextResponse.json(
        { error: `mesocycle_phase must be one of: ${validPhases.join(", ")}` },
        { status: 400 }
      );
    }

    // ── Hard Lock aggregation ──────────────────────────────────────────────
    // Collect all unique hard-locked tags across the team.
    // Any tag locked for even one athlete is excluded from the team menu.
    const teamLockedTagSet = new Set<string>();
    const lockViolationsByAthlete: Record<string, string[]> = {};

    if (locked_athletes && locked_athletes.length > 0) {
      await Promise.all(
        locked_athletes.map(async (la) => {
          const { blocked } = await validateHardLocks(la.athlete_id, la.tags);
          // Also include tags passed by caller that are confirmed locks
          const allBlocked = Array.from(
            new Set([...blocked, ...la.tags]) // union: confirmed + caller-supplied
          );
          allBlocked.forEach((t) => teamLockedTagSet.add(t.toLowerCase()));
          if (allBlocked.length > 0) {
            lockViolationsByAthlete[la.athlete_id] = allBlocked;
          }
        })
      );
    }

    const filteredTags = Array.from(teamLockedTagSet);

    // ── Gemini generation ──────────────────────────────────────────────────
    let blocks: GeneratedBlock[];
    let usedFallback = false;

    try {
      blocks = await generateWithRetry(body, filteredTags);
    } catch {
      blocks = [];
      usedFallback = true;
    }

    if (usedFallback) {
      const fallback = buildFallbackWorkout(team_id);
      return NextResponse.json(
        {
          ...fallback,
          fallback_used: true,
          hard_lock_summary: lockViolationsByAthlete,
          cds_disclaimer: CDS_DISCLAIMER,
        },
        {
          headers: {
            "X-RateLimit-Remaining": String(rl.remaining),
            "X-RateLimit-Reset": String(rl.resetAt),
          },
        }
      );
    }

    // ── Post-filter: remove any exercises that slipped past Hard Locks ─────
    const lockedTagFilter = new Set(filteredTags.map((t) => t.toLowerCase()));

    const menu: WorkoutItem[] = [];
    let itemIndex = 0;

    for (const block of blocks) {
      for (const ex of block.exercises) {
        const tags = ex.contraindication_tags ?? [];
        const violated = tags.some((t) => lockedTagFilter.has(t.toLowerCase()));
        if (violated) {
          console.warn(
            `[team-workout] Post-filtered exercise "${ex.exercise_name}" (block: ${block.block_name}) — hard lock tag match`
          );
          continue;
        }
        menu.push({
          exercise_id: `ai-team-${Date.now()}-${itemIndex++}`,
          exercise_name: ex.exercise_name,
          sets: ex.sets,
          reps_or_time: ex.reps_or_time,
          unit: ex.unit,
          rpe: ex.rpe,
          cues: ex.cues,
          reason: ex.reason,
          block: block.block_name,
        });
      }
    }

    const totalDurationMin = blocks.reduce((sum, b) => sum + (b.duration_min ?? 0), 0);

    const workout: Workout = {
      id: `workout-team-${Date.now()}`,
      team_id,
      type: "team",
      generated_by_ai: true,
      generated_at: new Date().toISOString(),
      menu,
      total_duration_min: totalDurationMin || 120,
      notes: CDS_DISCLAIMER,
    };

    return NextResponse.json(
      {
        ...workout,
        fallback_used: false,
        hard_lock_summary: lockViolationsByAthlete,
        cds_disclaimer: CDS_DISCLAIMER,
      },
      {
        headers: {
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(rl.resetAt),
        },
      }
    );
  } catch (err) {
    console.error("[api/team-workout]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
