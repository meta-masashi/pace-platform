/**
 * PACE Platform — 反事実プリセット介入シナリオ API
 *
 * GET /api/counterfactual/presets?athleteId=xxx&targetDate=yyyy-mm-dd
 *
 * 指定アスリートに対して利用可能なプリセット介入シナリオを返す。
 * UI でワンクリックで選択できる定型介入パターン。
 *
 * プリセット:
 *   1. スプリントを中止 — toggle_exercise, sprint OFF
 *   2. 練習強度を60%に — set_intensity, 60
 *   3. 完全休養日 — set_rest_day
 *   4. 負荷を50%カット — modify_load, 0.5
 *
 * PRD Phase 3 — Counterfactual Presets API
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiHandler, ApiError } from "@/lib/api/handler";
import type {
  PresetIntervention,
  CounterfactualPresetsResponse,
  CounterfactualErrorResponse,
} from "@/lib/counterfactual/types";

// ---------------------------------------------------------------------------
// プリセット定義
// ---------------------------------------------------------------------------

/**
 * 標準プリセット介入シナリオ。
 *
 * これらはスポーツ現場で頻繁に検討される介入パターンであり、
 * AT/PT が素早くリスク影響をシミュレートできるよう定型化したもの。
 */
const STANDARD_PRESETS: PresetIntervention[] = [
  {
    id: "sprint_off",
    label: "スプリントを中止",
    description:
      "本日のトレーニングからスプリント系メニューを除外した場合のリスク変化をシミュレートします。",
    interventions: [
      {
        type: "toggle_exercise",
        parameter: "sprintEnabled",
        value: false,
        description: "本日のスプリントを中止",
      },
    ],
  },
  {
    id: "intensity_60",
    label: "練習強度を60%に",
    description:
      "本日のトレーニング強度を60%に制限した場合のリスク変化をシミュレートします。",
    interventions: [
      {
        type: "set_intensity",
        parameter: "trainingIntensity",
        value: 60,
        description: "練習強度を60%に制限",
      },
    ],
  },
  {
    id: "rest_day",
    label: "完全休養日",
    description:
      "本日を完全休養日とした場合のリスク変化をシミュレートします。全トレーニング負荷がゼロになります。",
    interventions: [
      {
        type: "set_rest_day",
        parameter: "allLoad",
        value: 0,
        description: "完全休養日に設定",
      },
    ],
  },
  {
    id: "load_50pct",
    label: "負荷を50%カット",
    description:
      "本日のトレーニング負荷を50%に削減した場合のリスク変化をシミュレートします。",
    interventions: [
      {
        type: "modify_load",
        parameter: "loadFactor",
        value: 0.5,
        description: "負荷を50%カット",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// GET /api/counterfactual/presets
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (request, _ctx) => {
  const { searchParams } = new URL(request.url);
  const athleteId = searchParams.get("athleteId");
  const targetDate = searchParams.get("targetDate");

  // ----- バリデーション -----
  if (!athleteId) {
    throw new ApiError(400, "athleteId クエリパラメータが必要です。");
  }

  if (!targetDate) {
    throw new ApiError(400, "targetDate クエリパラメータが必要です。");
  }

  // 日付形式バリデーション
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new ApiError(400, "targetDate は YYYY-MM-DD 形式で指定してください。");
  }

  // ----- 認証チェック -----
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。ログインしてください。");
  }

  // ----- アスリートアクセス確認（RLS 経由） -----
  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("id, org_id")
    .eq("id", athleteId)
    .single();

  if (athleteError || !athlete) {
    throw new ApiError(403, "指定されたアスリートが見つからないか、アクセス権がありません。");
  }

  // ----- プリセットを返す -----
  return NextResponse.json({
    success: true,
    data: {
      athleteId,
      targetDate,
      presets: STANDARD_PRESETS,
    },
  });
}, { service: 'counterfactual' });
