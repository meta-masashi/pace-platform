import { describe, it, expect, beforeEach } from 'vitest';
import { getCircuitState, isCircuitOpen, recordSuccess, recordFailure, resetCircuitBreaker } from '../../lib/gemini/circuit-breaker';

describe('サーキットブレーカー', () => {
  beforeEach(() => resetCircuitBreaker());

  it('初期状態は CLOSED', () => {
    expect(getCircuitState()).toBe('CLOSED');
    expect(isCircuitOpen()).toBe(false);
  });

  it('閾値未満の失敗では CLOSED を維持', () => {
    for (let i = 0; i < 4; i++) recordFailure();
    expect(getCircuitState()).toBe('CLOSED');
  });

  it('5回連続失敗で OPEN に遷移', () => {
    for (let i = 0; i < 5; i++) recordFailure();
    expect(getCircuitState()).toBe('OPEN');
    expect(isCircuitOpen()).toBe(true);
  });

  it('成功で CLOSED にリセット', () => {
    for (let i = 0; i < 3; i++) recordFailure();
    recordSuccess();
    expect(getCircuitState()).toBe('CLOSED');
  });

  it('OPEN 中は isCircuitOpen が true', () => {
    for (let i = 0; i < 5; i++) recordFailure();
    expect(isCircuitOpen()).toBe(true);
  });
});
