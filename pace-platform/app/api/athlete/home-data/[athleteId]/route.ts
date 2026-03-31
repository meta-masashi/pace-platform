/**
 * PACE Platform — アスリートホームデータ統合 API
 *
 * GET /api/athlete/home-data/:athleteId
 *
 * v6 パイプライン結果 + コンディショニングデータを1リクエストで返す。
 * v6 API は 5秒タイムアウトでフォールバック。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateUUID } from '@/lib/security/input-validator';

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

    // v6 パイプラインとコンディショニングを並列取得
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://hachi-riskon.com';

    const v6Controller = new AbortController();
    const v6Timeout = setTimeout(() => v6Controller.abort(), 5000);

    const [v6Result, condResult, daysResult] = await Promise.allSettled([
      // v6 パイプライン
      fetch(`${baseUrl}/api/v6/inference/${athleteId}`, {
        signal: v6Controller.signal,
      })
        .then((r) => r.json())
        .finally(() => clearTimeout(v6Timeout)),

      // コンディショニングデータ
      fetch(`${baseUrl}/api/conditioning/${athleteId}`).then((r) => r.json()),

      // データ蓄積日数
      supabase
        .from('daily_metrics')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId),
    ]);

    // v6 データ
    let v6 = undefined;
    if (v6Result.status === 'fulfilled' && v6Result.value?.success) {
      v6 = v6Result.value.data;
    }

    // コンディショニングデータ
    let conditioning = undefined;
    if (condResult.status === 'fulfilled' && condResult.value?.success) {
      const d = condResult.value.data;
      conditioning = {
        conditioningScore: d.current?.conditioningScore ?? 0,
        fitnessEwma: d.current?.fitnessEwma ?? 0,
        fatigueEwma: d.current?.fatigueEwma ?? 0,
        acwr: d.current?.acwr ?? 0,
        fitnessTrend: d.fitnessTrend ?? [],
        fatigueTrend: d.fatigueTrend ?? [],
        insight: d.insight ?? '',
        latestDate: d.latest_date ?? '',
      };
    }

    // データ蓄積日数
    const validDataDays =
      daysResult.status === 'fulfilled' ? (daysResult.value.count ?? 0) : 0;

    return NextResponse.json({
      success: true,
      data: { v6, conditioning, validDataDays },
    });
  } catch (err) {
    console.error('[athlete/home-data] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
