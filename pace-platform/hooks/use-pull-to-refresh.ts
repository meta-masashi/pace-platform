/**
 * hooks/use-pull-to-refresh.ts
 * ============================================================
 * Pull-to-Refresh フック
 *
 * モバイル向けのプルダウンリフレッシュ機能。
 * スクロール位置が最上部のときに下方向スワイプで onRefresh を実行する。
 * ============================================================
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PullToRefreshOptions {
  /** リフレッシュ発火に必要な最小プル距離（px） */
  threshold?: number;
  /** リフレッシュ実行関数 */
  onRefresh: () => Promise<void>;
}

interface PullToRefreshState {
  /** 引っ張り中フラグ */
  isPulling: boolean;
  /** リフレッシュ中フラグ */
  isRefreshing: boolean;
  /** 現在のプル距離（px） */
  pullDistance: number;
}

export function usePullToRefresh(options: PullToRefreshOptions) {
  const { threshold = 80, onRefresh } = options;
  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    isRefreshing: false,
    pullDistance: 0,
  });

  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // スクロール位置が最上部のときのみ有効
    if (window.scrollY > 0) return;
    const touch = e.touches[0];
    if (touch) {
      startY.current = touch.clientY;
      setState((prev) => ({ ...prev, isPulling: true }));
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!state.isPulling || state.isRefreshing) return;
    const touch = e.touches[0];
    if (!touch) return;

    const delta = touch.clientY - startY.current;
    if (delta > 0 && window.scrollY === 0) {
      // 抵抗感を出すため距離を半減
      const distance = Math.min(delta * 0.5, threshold * 1.5);
      setState((prev) => ({ ...prev, pullDistance: distance }));
      if (distance > 10) {
        e.preventDefault(); // ブラウザのデフォルト pull-to-refresh を抑制
      }
    }
  }, [state.isPulling, state.isRefreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!state.isPulling) return;

    if (state.pullDistance >= threshold) {
      setState((prev) => ({ ...prev, isRefreshing: true, pullDistance: threshold * 0.5 }));

      // ハプティクフィードバック
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }

      try {
        await onRefresh();
      } finally {
        setState({ isPulling: false, isRefreshing: false, pullDistance: 0 });
      }
    } else {
      setState({ isPulling: false, isRefreshing: false, pullDistance: 0 });
    }
  }, [state.isPulling, state.pullDistance, threshold, onRefresh]);

  useEffect(() => {
    const el = containerRef.current ?? document;
    el.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true });
    el.addEventListener('touchmove', handleTouchMove as EventListener, { passive: false });
    el.addEventListener('touchend', handleTouchEnd as EventListener, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart as EventListener);
      el.removeEventListener('touchmove', handleTouchMove as EventListener);
      el.removeEventListener('touchend', handleTouchEnd as EventListener);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    containerRef,
    ...state,
    /** プル量の割合（0-1） */
    pullProgress: Math.min(state.pullDistance / threshold, 1),
  };
}
