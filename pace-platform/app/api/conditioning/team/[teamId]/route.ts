/**
 * PACE Platform — チームコンディショニング API
 *
 * GET /api/conditioning/team/:teamId
 *
 * チーム全選手のコンディショニングスコアを集約して返す。
 * YouTube Analytics 風ダッシュボードのデータソース。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateConditioningScore } from '@/lib/conditioning/engine';
import {
  calculateTeamConditioningScore,
  classifyTrend,
} from '@/lib/conditioning/team-score';
import type { AthleteConditioningEntry } from '@/lib/conditioning/team-score';
import { validateUUID } from '@/lib/security/input-validator';
import type { DailyMetricRow } from '@/lib/conditioning/types';

// ---------------------------------------------------------------------------
// GET /api/conditioning/team/:teamId
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;

    // ----- バリデーション -----
    if (!teamId || !validateUUID(teamId)) {
      return NextResponse.json(
        { success: false, error: 'チームIDが不正です。' },
        { status: 400 },
      );
    }

    // ----- 認証チェック -----
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。' },
        { status: 401 },
      );
    }

    // ----- IDOR 防止: スタッフの team_id を検証 -----
    const { data: staff } = await supabase
      .from('staff')
      .select('id, role, team_id, org_id')
      .eq('auth_id', user.id)
      .single();

    if (!staff) {
      return NextResponse.json(
        { success: false, error: 'スタッフ情報が見つかりません。' },
        { status: 403 },
      );
    }

    // master 以外は自チームのみアクセス可
    if (staff.role !== 'master' && staff.team_id !== teamId) {
      return NextResponse.json(
        { success: false, error: 'このチームへのアクセス権がありません。' },
        { status: 403 },
      );
    }

    // ----- チームの全選手を取得 -----
    const { data: athleteRows, error: athleteError } = await supabase
      .from('athletes')
      .select('id, full_name, hard_lock, risk_level')
      .eq('team_id', teamId);

    if (athleteError) {
      console.error('[team-conditioning] 選手取得エラー:', athleteError);
      return NextResponse.json(
        { success: false, error: 'チーム選手情報の取得に失敗しました。' },
        { status: 500 },
      );
    }

    const athletes = athleteRows ?? [];

    if (athletes.length === 0) {
      return NextResponse.json({
        success: true,
        data: calculateTeamConditioningScore(teamId, todayStr(), []),
      });
    }

    // ----- 42日間の daily_metrics を全選手分一括取得 -----
    const today = todayStr();
    const fromDate = daysAgoStr(42);
    const athleteIds = athletes.map((a) => a.id as string);

    const { data: allMetrics, error: metricsError } = await supabase
      .from('daily_metrics')
      .select(
        'athlete_id, date, srpe, sleep_score, fatigue_subjective, hrv, hrv_baseline, conditioning_score',
      )
      .in('athlete_id', athleteIds)
      .gte('date', fromDate)
      .lte('date', today)
      .order('date', { ascending: true });

    if (metricsError) {
      console.error('[team-conditioning] daily_metrics 取得エラー:', metricsError);
      return NextResponse.json(
        { success: false, error: 'コンディションデータの取得に失敗しました。' },
        { status: 500 },
      );
    }

    // 選手ごとにメトリクスをグループ化
    const metricsByAthlete = new Map<string, typeof allMetrics>();
    for (const row of allMetrics ?? []) {
      const aid = row.athlete_id as string;
      const existing = metricsByAthlete.get(aid);
      if (existing) {
        existing.push(row);
      } else {
        metricsByAthlete.set(aid, [row]);
      }
    }

    // ----- 各選手のコンディショニングスコアを算出 -----
    const entries: AthleteConditioningEntry[] = [];

    for (const athlete of athletes) {
      const aid = athlete.id as string;
      const name = (athlete.full_name as string) ?? '不明';
      const isHardLocked = !!(athlete.hard_lock as boolean | null);
      const isCritical = (athlete.risk_level as string | null) === 'critical';
      const rows = metricsByAthlete.get(aid) ?? [];

      if (rows.length === 0) {
        entries.push({
          athleteId: aid,
          name,
          conditioningScore: 50,
          fitnessEwma: 0,
          fatigueEwma: 0,
          acwr: 0,
          isProMode: false,
          trend: 'stable',
          dataCompleteness: 0,
          isHardLocked,
          isCritical,
        });
        continue;
      }

      // 最新日のデータでスコア算出
      const latestRow = rows[rows.length - 1]!;
      const historyRows = rows.slice(0, -1);

      const history: DailyMetricRow[] = historyRows.map((r) => ({
        date: r.date as string,
        srpe: r.srpe as number | null,
        sleepScore: r.sleep_score as number | null,
        fatigueSubjective: r.fatigue_subjective as number | null,
        hrv: r.hrv as number | null,
        hrvBaseline: r.hrv_baseline as number | null,
      }));

      const latestHrv = latestRow.hrv as number | null;
      const latestHrvBaseline = latestRow.hrv_baseline as number | null;

      const result = calculateConditioningScore(history, {
        srpe: (latestRow.srpe as number | null) ?? 0,
        sleepScore: (latestRow.sleep_score as number | null) ?? 5,
        fatigueSubjective: (latestRow.fatigue_subjective as number | null) ?? 5,
        ...(latestHrv !== null ? { hrv: latestHrv } : {}),
        ...(latestHrvBaseline !== null ? { hrvBaseline: latestHrvBaseline } : {}),
      });

      // 直近7日のスコアでトレンド算出
      const recentScores = rows
        .slice(-7)
        .map((r) => (r.conditioning_score as number | null) ?? result.conditioningScore);
      const trend = classifyTrend(recentScores);

      // データ完全性: 42日中何日分のデータがあるか
      const dataCompleteness = Math.min(rows.length / 42, 1);

      entries.push({
        athleteId: aid,
        name,
        conditioningScore: result.conditioningScore,
        fitnessEwma: result.fitnessEwma,
        fatigueEwma: result.fatigueEwma,
        acwr: result.acwr,
        isProMode: result.isProMode,
        trend,
        dataCompleteness,
        isHardLocked,
        isCritical,
      });
    }

    // ----- チーム集約 -----
    const teamResult = calculateTeamConditioningScore(teamId, today, entries);

    return NextResponse.json({
      success: true,
      data: teamResult,
    });
  } catch (err) {
    console.error('[team-conditioning] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function todayStr(): string {
  return new Date().toISOString().split('T')[0]!;
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0]!;
}
