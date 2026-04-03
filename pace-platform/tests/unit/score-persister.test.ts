/**
 * tests/unit/score-persister.test.ts
 * ============================================================
 * コンディショニングスコア永続化ヘルパーのテスト
 *
 * 対象: lib/conditioning/score-persister.ts
 * ============================================================
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const filePath = path.resolve(__dirname, '../../lib/conditioning/score-persister.ts');
const content = fs.readFileSync(filePath, 'utf-8');

describe('score-persister — コードパターン検証', () => {
  it('persistConditioningScore が export されている', () => {
    expect(content).toContain('export async function persistConditioningScore');
  });

  it('persistTeamScores が export されている', () => {
    expect(content).toContain('export async function persistTeamScores');
  });

  it('upsert が onConflict athlete_id,date で呼ばれている', () => {
    expect(content).toContain("onConflict: 'athlete_id,date'");
  });

  it('conditioning_score カラムが upsert されている', () => {
    expect(content).toContain('conditioning_score');
    expect(content).toContain('fitness_ewma');
    expect(content).toContain('fatigue_ewma');
    expect(content).toContain('acwr');
  });

  it('updated_at タイムスタンプが設定されている', () => {
    expect(content).toContain('updated_at');
  });

  it('空配列の場合は早期 return する', () => {
    expect(content).toContain('if (results.length === 0) return');
  });

  it('エラーハンドリングが実装されている', () => {
    expect(content).toContain('if (error)');
    expect(content).toContain('log.error');
  });
});
