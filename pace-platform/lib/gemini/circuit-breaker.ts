/**
 * lib/gemini/circuit-breaker.ts
 * ============================================================
 * PACE Platform — Gemini API サーキットブレーカー
 *
 * Gemini API の連続障害時に自動的にリクエストを遮断し、
 * バックエンドの過負荷とタイムアウト蓄積を防止する。
 * ============================================================
 */

import { createLogger } from '@/lib/observability/logger';

const log = createLogger('circuit-breaker');

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 60_000; // 60秒

let state: CircuitState = 'CLOSED';
let consecutiveFailures = 0;
let lastFailureTime = 0;

export function getCircuitState(): CircuitState {
  if (state === 'OPEN' && Date.now() - lastFailureTime >= COOLDOWN_MS) {
    state = 'HALF_OPEN';
    log.info('サーキットブレーカー: HALF_OPEN へ遷移');
  }
  return state;
}

export function isCircuitOpen(): boolean {
  return getCircuitState() === 'OPEN';
}

export function recordSuccess(): void {
  if (state === 'HALF_OPEN') {
    log.info('サーキットブレーカー: CLOSED へ復帰');
  }
  state = 'CLOSED';
  consecutiveFailures = 0;
}

export function recordFailure(): void {
  consecutiveFailures++;
  lastFailureTime = Date.now();

  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    state = 'OPEN';
    log.error(`サーキットブレーカー: OPEN（${consecutiveFailures} 連続失敗）`);
  }
}

/** テスト用リセット */
export function resetCircuitBreaker(): void {
  state = 'CLOSED';
  consecutiveFailures = 0;
  lastFailureTime = 0;
}
