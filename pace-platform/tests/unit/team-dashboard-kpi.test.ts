/**
 * tests/unit/team-dashboard-kpi.test.ts
 * ============================================================
 * スタッフダッシュボード KPI + コンポーネントのコードパターン検証
 *
 * 対象:
 *   - app/(staff)/dashboard/_components/dashboard-content.tsx
 *   - app/(staff)/dashboard/_components/score-bucket-bar.tsx
 *   - app/(staff)/dashboard/_components/team-conditioning-chart.tsx
 * ============================================================
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const dashboardPath = path.resolve(
  __dirname,
  '../../app/(staff)/dashboard/_components/dashboard-content.tsx',
);
const bucketBarPath = path.resolve(
  __dirname,
  '../../app/(staff)/dashboard/_components/score-bucket-bar.tsx',
);
const teamChartPath = path.resolve(
  __dirname,
  '../../app/(staff)/dashboard/_components/team-conditioning-chart.tsx',
);

const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');
const bucketBarContent = fs.readFileSync(bucketBarPath, 'utf-8');
const teamChartContent = fs.readFileSync(teamChartPath, 'utf-8');

describe('dashboard-content — Sprint 7 統合', () => {
  it('TeamConditioningChart がインポートされている', () => {
    expect(dashboardContent).toContain("import { TeamConditioningChart }");
  });

  it('ScoreBucketBar がインポートされている', () => {
    expect(dashboardContent).toContain("import { ScoreBucketBar }");
  });

  it('チームコンディショニング API を fetch している', () => {
    expect(dashboardContent).toContain('/api/conditioning/team/');
  });

  it('teamConditioning ステートが定義されている', () => {
    expect(dashboardContent).toContain('teamConditioning');
    expect(dashboardContent).toContain('setTeamConditioning');
  });
});

describe('score-bucket-bar — コンポーネント検証', () => {
  it('ScoreBucketBar が export されている', () => {
    expect(bucketBarContent).toContain('export function ScoreBucketBar');
  });

  it('4セグメント（optimal/caution/recovery/noData）が定義されている', () => {
    expect(bucketBarContent).toContain("'optimal'");
    expect(bucketBarContent).toContain("'caution'");
    expect(bucketBarContent).toContain("'recovery'");
    expect(bucketBarContent).toContain("'noData'");
  });

  it('ホバーで選手名リストが表示される', () => {
    expect(bucketBarContent).toContain('hoveredBucket');
    expect(bucketBarContent).toContain('athleteNames');
  });

  it('前日比の変動矢印が実装されている', () => {
    expect(bucketBarContent).toContain('deltaArrow');
    expect(bucketBarContent).toContain('previousBuckets');
  });
});

describe('team-conditioning-chart — コンポーネント検証', () => {
  it('TeamConditioningChart が export されている', () => {
    expect(teamChartContent).toContain('export function TeamConditioningChart');
  });

  it('Recharts ComposedChart を使用している', () => {
    expect(teamChartContent).toContain('ComposedChart');
  });

  it('スコアバケット帯（ReferenceArea）が定義されている', () => {
    expect(teamChartContent).toContain('ReferenceArea');
    expect(teamChartContent).toContain('y1={70}');
    expect(teamChartContent).toContain('y1={40}');
    expect(teamChartContent).toContain('y1={0}');
  });

  it('Team Score エリアチャートが表示される', () => {
    expect(teamChartContent).toContain('teamScore');
    expect(teamChartContent).toContain('teamScoreGradient');
  });
});
