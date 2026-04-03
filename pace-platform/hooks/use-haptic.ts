/**
 * hooks/use-haptic.ts
 * ============================================================
 * ハプティクフィードバックフック
 *
 * Vibration API を使用した触覚フィードバック。
 * iOS Safari は未対応のため安全にフォールバックする。
 * ============================================================
 */

'use client';

import { useCallback } from 'react';

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 30,
  heavy: 50,
  success: [10, 50, 20],
  warning: [30, 30, 30],
  error: [50, 100, 50, 100, 50],
};

export function useHaptic() {
  const vibrate = useCallback((pattern: HapticPattern = 'light') => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(PATTERNS[pattern]);
      } catch {
        // 権限拒否等 — 無視
      }
    }
  }, []);

  const isSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  return { vibrate, isSupported };
}
