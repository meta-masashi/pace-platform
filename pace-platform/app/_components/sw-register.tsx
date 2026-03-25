'use client';

import { useEffect } from 'react';

/**
 * Service Worker 登録コンポーネント
 *
 * アプリケーションのマウント時に Service Worker を登録する。
 * UIは描画しない（null を返す）。
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('[PACE] Service Worker 登録エラー:', err);
      });
    }
  }, []);

  return null;
}
