/**
 * tests/unit/conditioning-feed.test.ts
 * ============================================================
 * Strava風コンディショニングフィードのコードパターン検証
 *
 * 対象: app/(athlete)/home/_components/conditioning-feed.tsx
 * ============================================================
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const filePath = path.resolve(
  __dirname,
  '../../app/(athlete)/home/_components/conditioning-feed.tsx',
);
const content = fs.readFileSync(filePath, 'utf-8');

describe('conditioning-feed — コードパターン検証', () => {
  it('DailyFeedEntry 型が export されている', () => {
    expect(content).toContain('export interface DailyFeedEntry');
  });

  it('ConditioningFeed コンポーネントが export されている', () => {
    expect(content).toContain('export function ConditioningFeed');
  });

  it('4メトリクス（Fitness/Fatigue/ACWR/Sleep）ミニカードが表示される', () => {
    expect(content).toContain('Fitness');
    expect(content).toContain('Fatigue');
    expect(content).toContain('ACWR');
    expect(content).toContain('Sleep');
  });

  it('前日比スコア差分が表示される', () => {
    expect(content).toContain('scoreDelta');
    expect(content).toContain('deltaColor');
  });

  it('空データ時のフォールバック表示がある', () => {
    expect(content).toContain('チェックインデータがまだありません');
  });

  it('展開/折りたたみ機能がある', () => {
    expect(content).toContain('expanded');
    expect(content).toContain('setExpanded');
  });

  it('スコア色分けが実装されている（optimal/caution/recovery）', () => {
    expect(content).toContain('scoreColor');
    expect(content).toContain('>= 70');
    expect(content).toContain('>= 40');
  });
});
