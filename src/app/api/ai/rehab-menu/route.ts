import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { RehabPhase, WorkoutItem } from "@/types";
import { checkRateLimit, extractUserId } from "@/lib/rate-limit";
import { validateHardLocks } from "@/lib/hard-lock";
import { createClient } from "@/lib/supabase/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const CDS_DISCLAIMER =
  "※ このメニューはAI生成による臨床意思決定支援情報です。医療専門家による判断を優先し、最終決定は必ず担当スタッフが行ってください。";

interface RehabMenuRequest {
  athlete_id: string;
  diagnosis_code: string;
  phase: RehabPhase;
  hard_lock_tags: string[];
  soft_lock_tags: string[];
  nrs: number;
  rom?: number;
}

interface GeneratedMenuItem {
  exercise_name: string;
  sets: number;
  reps_or_time: string;
  unit: "reps" | "sec" | "min";
  rpe?: number;
  cues?: string;
  reason: string;
  contraindication_tags?: string[];
}

function buildPrompt(req: RehabMenuRequest, retryHint = false): string {
  const phaseGuidelines: Record<RehabPhase, string> = {
    1: "急性期（Phase 1）: 安静・疼痛管理・炎症抑制が最優先。荷重制限あり。ROMは痛みのない範囲のみ。",
    2: "亜急性期（Phase 2）: 可動域回復・筋力回復開始。軽度荷重可。NRS ≤ 3を維持すること。",
    3: "機能回復期（Phase 3）: 筋力・協調性・神経筋制御の回復。動的運動導入。NRS ≤ 2を維持。",
    4: "復帰前期（Phase 4）: 競技特異的動作の再獲得。スポーツ特有の負荷に対応。NRS ≤ 1を維持。",
  };

  const retryPrefix = retryHint
    ? `【重要】前回の出力がJSON形式ではありませんでした。今回は必ずJSON配列のみを出力してください。説明文・マークダウン・コードブロックは一切不要です。\n\n`
    : "";

  return `${retryPrefix}あなたはスポーツ医学・リハビリテーションの専門家AIです。
以下の選手情報に基づいて、安全で効果的なリハビリメニューを日本語でJSON形式で出力してください。

## 選手情報
- 診断コード: ${req.diagnosis_code}
- リハビリフェーズ: Phase ${req.phase}
- 現在のNRS（疼痛）: ${req.nrs}/10
- ROM: ${req.rom !== undefined ? `${req.rom}°` : "未計測"}

## フェーズ指針
${phaseGuidelines[req.phase]}

## 制約（Hard Lock）
以下のタグに該当するエクササイズは絶対に含めないこと:
${req.hard_lock_tags.length > 0 ? req.hard_lock_tags.map((t) => `- ${t}`).join("\n") : "なし"}

## 注意事項（Soft Lock）
以下のタグに該当するエクササイズは強度を大幅に下げるか、代替種目を使用すること:
${req.soft_lock_tags.length > 0 ? req.soft_lock_tags.map((t) => `- ${t}`).join("\n") : "なし"}

## 出力形式
必ず以下のJSON配列のみを出力してください（コードブロックや説明文は不要）:
[
  {
    "exercise_name": "エクササイズ名（日本語）",
    "sets": 数値,
    "reps_or_time": "回数または時間を文字列で",
    "unit": "reps" | "sec" | "min",
    "rpe": 数値（6-20スケール、省略可）,
    "cues": "実施上の注意点（省略可）",
    "reason": "このエクササイズを選択した理由",
    "contraindication_tags": ["このエクササイズが除外すべきタグ（空配列可）"]
  }
]

メニューは4〜6種目、合計所要時間が30〜60分になるように構成してください。`.trim();
}

/** Strip markdown code fences and return cleaned JSON text */
function cleanJsonText(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** Fallback menu returned when all Gemini retries fail */
function buildFallbackMenu(req: RehabMenuRequest): WorkoutItem[] {
  return [
    {
      exercise_id: `fallback-${Date.now()}-0`,
      exercise_name: "アイシング（患部冷却）",
      sets: 1,
      reps_or_time: "15",
      unit: "min",
      rpe: undefined,
      cues: "患部を氷嚢で冷却。皮膚保護のためタオルを挟むこと。",
      reason: `Phase ${req.phase} 基本処置 — AI生成失敗のため安全なフォールバックメニューを提供`,
      block: "基本処置",
    },
    {
      exercise_id: `fallback-${Date.now()}-1`,
      exercise_name: "安静・挙上",
      sets: 1,
      reps_or_time: "20",
      unit: "min",
      rpe: undefined,
      cues: "患部を心臓より高く保持。",
      reason: "炎症抑制のための基本RICE処置",
      block: "基本処置",
    },
  ];
}

/** Call Gemini with retry on JSON parse failure (up to maxRetries additional attempts) */
async function generateWithRetry(
  req: RehabMenuRequest,
  maxRetries = 2
): Promise<GeneratedMenuItem[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prompt = buildPrompt(req, attempt > 0);

    try {
      const result = await model.generateContent(prompt);
      const rawText = result.response.text().trim();
      const jsonText = cleanJsonText(rawText);
      const parsed = JSON.parse(jsonText);

      if (!Array.isArray(parsed)) {
        throw new Error("Response is not a JSON array");
      }

      return parsed as GeneratedMenuItem[];
    } catch (err) {
      lastError = err;
      console.warn(
        `[rehab-menu] JSON parse attempt ${attempt + 1} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.error("[rehab-menu] All Gemini retries exhausted:", lastError);
  // Signal caller to use fallback
  throw new Error("GEMINI_PARSE_EXHAUSTED");
}

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
    const rl = checkRateLimit(userId, "rehab-menu");
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

    const body = (await request.json()) as RehabMenuRequest;
    const { athlete_id, diagnosis_code, phase, hard_lock_tags, soft_lock_tags, nrs, rom } = body;

    if (!athlete_id || !diagnosis_code || phase === undefined || nrs === undefined) {
      return NextResponse.json(
        { error: "athlete_id, diagnosis_code, phase, and nrs are required" },
        { status: 400 }
      );
    }

    const resolvedHardLocks = hard_lock_tags ?? [];
    const resolvedSoftLocks = soft_lock_tags ?? [];

    // ── Hard Lock validation ───────────────────────────────────────────────
    // Pre-flight: if the caller passes exercise tags to check, validate them.
    // For the rehab menu route the hard_lock_tags themselves are the athlete's
    // active locks; we pass them through to Gemini and also post-filter.
    const { blocked: hardBlocked } = await validateHardLocks(
      athlete_id,
      resolvedHardLocks
    );
    if (hardBlocked.length > 0) {
      console.info(
        `[rehab-menu] Hard locks confirmed for ${athlete_id}: ${hardBlocked.join(", ")}`
      );
    }

    const req: RehabMenuRequest = {
      athlete_id,
      diagnosis_code,
      phase,
      hard_lock_tags: resolvedHardLocks,
      soft_lock_tags: resolvedSoftLocks,
      nrs,
      rom,
    };

    // ── Gemini call with JSON retry ────────────────────────────────────────
    let menuItems: GeneratedMenuItem[];
    let usedFallback = false;

    try {
      menuItems = await generateWithRetry(req);
    } catch {
      menuItems = [];
      usedFallback = true;
    }

    // ── Hard Lock post-filter ──────────────────────────────────────────────
    const lockedTagSet = new Set(resolvedHardLocks.map((t) => t.toLowerCase()));

    const safeMenu: WorkoutItem[] = usedFallback
      ? buildFallbackMenu(req)
      : menuItems
          .filter((item) => {
            if (!item.contraindication_tags || item.contraindication_tags.length === 0) {
              return true;
            }
            const violated = item.contraindication_tags.some((tag: string) =>
              lockedTagSet.has(tag.toLowerCase())
            );
            if (violated) {
              console.warn(
                `[rehab-menu] Filtered exercise "${item.exercise_name}" due to hard lock violation`
              );
            }
            return !violated;
          })
          .map((item, index) => ({
            exercise_id: `ai-gen-${Date.now()}-${index}`,
            exercise_name: item.exercise_name,
            sets: item.sets,
            reps_or_time: item.reps_or_time,
            unit: item.unit,
            rpe: item.rpe,
            cues: item.cues,
            reason: item.reason,
          }));

    const totalDurationMin = safeMenu.reduce((total, item) => {
      const timePerSet =
        item.unit === "min"
          ? parseFloat(item.reps_or_time)
          : item.unit === "sec"
          ? parseFloat(item.reps_or_time) / 60
          : 0.5;
      return total + timePerSet * item.sets + 1;
    }, 0);

    return NextResponse.json(
      {
        athlete_id,
        diagnosis_code,
        phase,
        generated_at: new Date().toISOString(),
        menu: safeMenu,
        total_duration_min: Math.round(totalDurationMin),
        fallback_used: usedFallback,
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
    console.error("[ai/rehab-menu]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
