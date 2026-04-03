/**
 * PACE Platform — チームピーキング概要 API
 *
 * GET /api/team/peaking?team_id=xxx
 *
 * チーム全体のコンディショニング状況を集計して返す。
 * - チーム平均コンディショニングスコア
 * - アベイラビリティ（出場可能人数）
 * - クリティカル（要注意選手数）
 * - ウォッチリスト（監視対象選手数）
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiHandler, ApiError } from "@/lib/api/handler";

// ---------------------------------------------------------------------------
// レスポンス型定義
// ---------------------------------------------------------------------------

interface AthleteStatus {
  athlete_id: string;
  conditioning_score: number | null;
  acwr: number | null;
  nrs: number | null;
  status: "available" | "critical" | "watchlist" | "unknown";
}

interface PeakingResponse {
  success: true;
  data: {
    team_id: string;
    date: string;
    team_peaking_score: number;
    total_athletes: number;
    availability_count: number;
    critical_count: number;
    watchlist_count: number;
    athletes: AthleteStatus[];
  };
}

interface ErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// ステータス分類ロジック
// ---------------------------------------------------------------------------

/**
 * アスリートのコンディションステータスを判定する。
 *
 * クリティカル条件（いずれか一つ）:
 *   - conditioning_score < 30
 *   - NRS >= 7
 *   - Hard Lock フラグ
 *
 * ウォッチリスト条件（いずれか一つ）:
 *   - conditioning_score 30-50
 *   - ACWR > 1.5
 *   - Soft Lock フラグ
 *
 * アベイラブル条件:
 *   - conditioning_score >= 60 AND Hard Lock なし
 */
function classifyAthleteStatus(row: {
  conditioning_score: number | null;
  acwr: number | null;
  nrs: number | null;
  hard_lock: boolean | null;
  soft_lock: boolean | null;
}): "available" | "critical" | "watchlist" | "unknown" {
  const score = row.conditioning_score;
  const acwr = row.acwr;
  const nrs = row.nrs;
  const hardLock = row.hard_lock === true;
  const softLock = row.soft_lock === true;

  if (score === null) return "unknown";

  // クリティカル判定（最優先）
  if (score < 30 || (nrs !== null && nrs >= 7) || hardLock) {
    return "critical";
  }

  // ウォッチリスト判定
  if (
    (score >= 30 && score < 50) ||
    (acwr !== null && acwr > 1.5) ||
    softLock
  ) {
    return "watchlist";
  }

  // アベイラブル判定
  if (score >= 60 && !hardLock) {
    return "available";
  }

  // スコア 50-60 でその他条件なし → ウォッチリスト寄り
  return "watchlist";
}

// ---------------------------------------------------------------------------
// GET /api/team/peaking
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (request, ctx) => {
  // ----- クエリパラメータ取得 -----
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("team_id");

  if (!teamId || teamId.length === 0) {
    throw new ApiError(400, "team_id クエリパラメータは必須です。");
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

  // ----- チームアクセス確認（RLS 経由で同組織のスタッフのみ）-----
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, org_id")
    .eq("id", teamId)
    .single();

  if (teamError || !team) {
    throw new ApiError(403, "指定されたチームが見つからないか、アクセス権がありません。");
  }

  // ----- チームに所属するアスリート一覧を取得 -----
  const { data: teamAthletes, error: athletesError } = await supabase
    .from("athletes")
    .select("id")
    .eq("team_id", teamId);

  if (athletesError) {
    ctx.log.error("アスリート一覧取得エラー", { detail: athletesError });
    throw new ApiError(500, "チームアスリートの取得に失敗しました。");
  }

  const athleteIds = (teamAthletes ?? []).map((a) => a.id as string);

  if (athleteIds.length === 0) {
    return NextResponse.json({
      success: true,
      data: {
        team_id: teamId,
        date: new Date().toISOString().split("T")[0]!,
        team_peaking_score: 0,
        total_athletes: 0,
        availability_count: 0,
        critical_count: 0,
        watchlist_count: 0,
        athletes: [],
      },
    });
  }

  // ----- 当日の daily_metrics を取得 -----
  const today = new Date().toISOString().split("T")[0]!;

  const { data: todayMetrics, error: metricsError } = await supabase
    .from("daily_metrics")
    .select(
      "athlete_id, conditioning_score, acwr, nrs, hard_lock, soft_lock"
    )
    .in("athlete_id", athleteIds)
    .eq("date", today);

  if (metricsError) {
    ctx.log.error("daily_metrics 取得エラー", { detail: metricsError });
    throw new ApiError(500, "コンディションデータの取得に失敗しました。");
  }

  const metrics = todayMetrics ?? [];

  // ----- メトリクスをアスリートID でインデックス化 -----
  const metricsMap = new Map(
    metrics.map((m) => [m.athlete_id as string, m])
  );

  // ----- 各アスリートのステータスを分類 -----
  const athletes: AthleteStatus[] = athleteIds.map((athleteId) => {
    const row = metricsMap.get(athleteId);

    if (!row) {
      return {
        athlete_id: athleteId,
        conditioning_score: null,
        acwr: null,
        nrs: null,
        status: "unknown" as const,
      };
    }

    return {
      athlete_id: athleteId,
      conditioning_score: row.conditioning_score as number | null,
      acwr: row.acwr as number | null,
      nrs: row.nrs as number | null,
      status: classifyAthleteStatus({
        conditioning_score: row.conditioning_score as number | null,
        acwr: row.acwr as number | null,
        nrs: row.nrs as number | null,
        hard_lock: row.hard_lock as boolean | null,
        soft_lock: row.soft_lock as boolean | null,
      }),
    };
  });

  // ----- 集計 -----
  const scoredAthletes = athletes.filter(
    (a) => a.conditioning_score !== null
  );
  const teamPeakingScore =
    scoredAthletes.length > 0
      ? Math.round(
          (scoredAthletes.reduce(
            (sum, a) => sum + a.conditioning_score!,
            0
          ) /
            scoredAthletes.length) *
            10
        ) / 10
      : 0;

  const availabilityCount = athletes.filter(
    (a) => a.status === "available"
  ).length;
  const criticalCount = athletes.filter(
    (a) => a.status === "critical"
  ).length;
  const watchlistCount = athletes.filter(
    (a) => a.status === "watchlist"
  ).length;

  // ----- レスポンス -----
  return NextResponse.json({
    success: true,
    data: {
      team_id: teamId,
      date: today,
      team_peaking_score: teamPeakingScore,
      total_athletes: athleteIds.length,
      availability_count: availabilityCount,
      critical_count: criticalCount,
      watchlist_count: watchlistCount,
      athletes,
    },
  });
}, { service: 'team' });
