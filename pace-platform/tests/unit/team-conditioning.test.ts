/**
 * tests/unit/team-conditioning.test.ts
 * ============================================================
 * チームコンディショニングスコア集約エンジンのテスト
 *
 * 対象: lib/conditioning/team-score.ts
 * ============================================================
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTeamConditioningScore,
  classifyTrend,
} from '../../lib/conditioning/team-score';
import type { AthleteConditioningEntry } from '../../lib/conditioning/team-score';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeEntry(
  overrides: Partial<AthleteConditioningEntry> = {},
): AthleteConditioningEntry {
  return {
    athleteId: 'athlete-1',
    name: 'テスト選手',
    conditioningScore: 70,
    fitnessEwma: 50,
    fatigueEwma: 30,
    acwr: 1.1,
    isProMode: false,
    trend: 'stable',
    dataCompleteness: 1.0,
    isHardLocked: false,
    isCritical: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateTeamConditioningScore
// ---------------------------------------------------------------------------

describe('calculateTeamConditioningScore', () => {
  it('空チーム → スコア 50, athleteCount 0', () => {
    const result = calculateTeamConditioningScore('team-1', '2026-04-03', []);
    expect(result.teamScore).toBe(50);
    expect(result.athleteCount).toBe(0);
    expect(result.availability.total).toBe(0);
    expect(result.scoreBuckets.optimal).toBe(0);
  });

  it('単一選手 → チームスコア = 個人スコア', () => {
    const entry = makeEntry({ conditioningScore: 75 });
    const result = calculateTeamConditioningScore('team-1', '2026-04-03', [entry]);
    expect(result.teamScore).toBe(75);
    expect(result.athleteCount).toBe(1);
  });

  it('複数選手の加重平均（等しいデータ完全性）', () => {
    const entries = [
      makeEntry({ athleteId: 'a1', conditioningScore: 80, dataCompleteness: 1.0 }),
      makeEntry({ athleteId: 'a2', conditioningScore: 60, dataCompleteness: 1.0 }),
    ];
    const result = calculateTeamConditioningScore('team-1', '2026-04-03', entries);
    expect(result.teamScore).toBe(70); // (80 + 60) / 2
  });

  it('データ完全性による重み付け', () => {
    const entries = [
      makeEntry({ athleteId: 'a1', conditioningScore: 80, dataCompleteness: 1.0 }),
      makeEntry({ athleteId: 'a2', conditioningScore: 40, dataCompleteness: 0.5 }),
    ];
    const result = calculateTeamConditioningScore('team-1', '2026-04-03', entries);
    // weighted = (80*1.0 + 40*0.5) / (1.0 + 0.5) = 100/1.5 = 66.67
    expect(result.teamScore).toBeCloseTo(66.7, 0);
  });

  it('dataCompleteness 0 の選手は noData バケット', () => {
    const entries = [
      makeEntry({ athleteId: 'a1', conditioningScore: 80, dataCompleteness: 1.0 }),
      makeEntry({ athleteId: 'a2', conditioningScore: 50, dataCompleteness: 0 }),
    ];
    const result = calculateTeamConditioningScore('team-1', '2026-04-03', entries);
    expect(result.scoreBuckets.noData).toBe(1);
    expect(result.scoreBuckets.optimal).toBe(1);
    expect(result.teamScore).toBe(80); // noData 選手は加重平均から除外
  });

  it('scoreBuckets: optimal / caution / recovery の分類', () => {
    const entries = [
      makeEntry({ athleteId: 'a1', conditioningScore: 85 }), // optimal
      makeEntry({ athleteId: 'a2', conditioningScore: 55 }), // caution
      makeEntry({ athleteId: 'a3', conditioningScore: 30 }), // recovery
      makeEntry({ athleteId: 'a4', conditioningScore: 70 }), // optimal (境界値)
      makeEntry({ athleteId: 'a5', conditioningScore: 40 }), // caution (境界値)
    ];
    const result = calculateTeamConditioningScore('team-1', '2026-04-03', entries);
    expect(result.scoreBuckets.optimal).toBe(2);
    expect(result.scoreBuckets.caution).toBe(2);
    expect(result.scoreBuckets.recovery).toBe(1);
  });

  it('availability: Hard Lock / critical は除外', () => {
    const entries = [
      makeEntry({ athleteId: 'a1', isHardLocked: false, isCritical: false }),
      makeEntry({ athleteId: 'a2', isHardLocked: true, isCritical: false }),
      makeEntry({ athleteId: 'a3', isHardLocked: false, isCritical: true }),
      makeEntry({ athleteId: 'a4', isHardLocked: false, isCritical: false }),
    ];
    const result = calculateTeamConditioningScore('team-1', '2026-04-03', entries);
    expect(result.availability.total).toBe(4);
    expect(result.availability.available).toBe(2);
    expect(result.availability.rate).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// classifyTrend
// ---------------------------------------------------------------------------

describe('classifyTrend', () => {
  it('空配列 → stable', () => {
    expect(classifyTrend([])).toBe('stable');
  });

  it('1要素 → stable', () => {
    expect(classifyTrend([70])).toBe('stable');
  });

  it('上昇トレンド → improving', () => {
    // 1日あたり +2 の上昇
    expect(classifyTrend([50, 52, 54, 56, 58, 60, 62])).toBe('improving');
  });

  it('下降トレンド → declining', () => {
    // 1日あたり -2 の下降
    expect(classifyTrend([62, 60, 58, 56, 54, 52, 50])).toBe('declining');
  });

  it('横ばい → stable', () => {
    expect(classifyTrend([70, 70.5, 69.5, 70, 70.5, 69.5, 70])).toBe('stable');
  });

  it('微増は stable（閾値 1.0 未満）', () => {
    // 1日あたり +0.5 → 閾値 1.0 未満
    expect(classifyTrend([70, 70.5, 71, 71.5, 72, 72.5, 73])).toBe('stable');
  });
});
