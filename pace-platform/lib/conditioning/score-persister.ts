/**
 * PACE Platform — コンディショニングスコア永続化ヘルパー
 *
 * 算出済みのコンディショニングスコアを daily_metrics テーブルに upsert し、
 * ダッシュボードの高速クエリに対応する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConditioningResult } from './types';
import { createLogger } from '@/lib/observability/logger';
const log = createLogger('conditioning');

// ---------------------------------------------------------------------------
// 個人スコアの永続化
// ---------------------------------------------------------------------------

/**
 * 個人のコンディショニングスコアを daily_metrics に upsert する。
 *
 * @param supabase Supabase クライアント
 * @param athleteId アスリート ID
 * @param date 対象日（YYYY-MM-DD）
 * @param result コンディショニングスコア算出結果
 */
export async function persistConditioningScore(
  supabase: SupabaseClient,
  athleteId: string,
  date: string,
  result: ConditioningResult,
): Promise<void> {
  const { error } = await supabase
    .from('daily_metrics')
    .upsert(
      {
        athlete_id: athleteId,
        date,
        conditioning_score: result.conditioningScore,
        fitness_ewma: result.fitnessEwma,
        fatigue_ewma: result.fatigueEwma,
        acwr: result.acwr,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'athlete_id,date' },
    );

  if (error) {
    log.error('個人スコア upsert エラー', { data: { error: error.message } });
  }
}

// ---------------------------------------------------------------------------
// チームスコアの一括永続化
// ---------------------------------------------------------------------------

/**
 * チーム全選手のコンディショニングスコアを daily_metrics に一括 upsert する。
 *
 * @param supabase Supabase クライアント
 * @param date 対象日（YYYY-MM-DD）
 * @param results 各選手のスコアデータ配列
 */
export async function persistTeamScores(
  supabase: SupabaseClient,
  date: string,
  results: Array<{
    athleteId: string;
    conditioningScore: number;
    fitnessEwma: number;
    fatigueEwma: number;
    acwr: number;
  }>,
): Promise<void> {
  if (results.length === 0) return;

  const now = new Date().toISOString();
  const rows = results.map((r) => ({
    athlete_id: r.athleteId,
    date,
    conditioning_score: r.conditioningScore,
    fitness_ewma: r.fitnessEwma,
    fatigue_ewma: r.fatigueEwma,
    acwr: r.acwr,
    updated_at: now,
  }));

  const { error } = await supabase
    .from('daily_metrics')
    .upsert(rows, { onConflict: 'athlete_id,date' });

  if (error) {
    log.error('チームスコア一括 upsert エラー', { data: { error: error.message } });
  }
}
