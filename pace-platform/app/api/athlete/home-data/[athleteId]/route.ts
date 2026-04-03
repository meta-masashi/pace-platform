/**
 * PACE Platform — アスリートホームデータ統合 API
 *
 * GET /api/athlete/home-data/:athleteId
 *
 * 直接DBクエリでコンディショニングデータを取得（内部fetch廃止）。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateUUID } from '@/lib/security/input-validator';
import { canAccess } from '@/lib/billing/plan-gates';
import { calculateConditioningScore } from '@/lib/conditioning/engine';
import type { DailyMetricRow, ConditioningInput } from '@/lib/conditioning/types';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ athleteId: string }> },
) {
  try {
    const { athleteId } = await params;

    if (!validateUUID(athleteId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid athlete ID' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。' },
        { status: 401 },
      );
    }

    // ----- プラン別機能ゲート -----
    const { data: athleteForGate } = await supabase
      .from('athletes')
      .select('org_id')
      .eq('id', athleteId)
      .single();

    if (athleteForGate?.org_id) {
      const accessResult = await canAccess(supabase, athleteForGate.org_id, 'feature_condition_score');
      if (!accessResult.allowed) {
        return NextResponse.json(
          { success: false, error: accessResult.reason ?? 'この機能はご利用いただけません。' },
          { status: 403 },
        );
      }
    }

    // 直近42日分の daily_metrics を取得
    const fortyTwoDaysAgo = new Date();
    fortyTwoDaysAgo.setDate(fortyTwoDaysAgo.getDate() - 42);
    const fromDate = fortyTwoDaysAgo.toISOString().split('T')[0]!;

    const { data: rows, error: fetchError } = await supabase
      .from('daily_metrics')
      .select('date, srpe, sleep_score, fatigue_subjective, hrv, hrv_baseline, conditioning_score, fitness_ewma, fatigue_ewma, acwr')
      .eq('athlete_id', athleteId)
      .gte('date', fromDate)
      .order('date', { ascending: true });

    if (fetchError) {
      console.error('[athlete/home-data] DB error:', fetchError);
      return NextResponse.json(
        { success: false, error: 'データの取得に失敗しました。' },
        { status: 500 },
      );
    }

    const allRows = rows ?? [];

    // 最新行からコンディショニングデータを構築
    const latestRow = allRows.length > 0 ? allRows[allRows.length - 1] : null;

    let conditioning = undefined;
    if (latestRow) {
      conditioning = {
        conditioningScore: (latestRow.conditioning_score as number) ?? 0,
        fitnessEwma: (latestRow.fitness_ewma as number) ?? 0,
        fatigueEwma: (latestRow.fatigue_ewma as number) ?? 0,
        acwr: (latestRow.acwr as number) ?? 0,
        fitnessTrend: allRows.slice(-14).map((r) => (r.fitness_ewma as number) ?? 0),
        fatigueTrend: allRows.slice(-14).map((r) => (r.fatigue_ewma as number) ?? 0),
        insight: '',
        latestDate: (latestRow.date as string) ?? '',
      };
    }

    // データ蓄積日数
    const { count: validDataDays } = await supabase
      .from('daily_metrics')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId);

    return NextResponse.json({
      success: true,
      data: {
        conditioning,
        validDataDays: validDataDays ?? 0,
      },
    });
  } catch (err) {
    console.error('[athlete/home-data] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
