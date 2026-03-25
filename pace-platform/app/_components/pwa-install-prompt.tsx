'use client';

import { useCallback, useEffect, useState } from 'react';

/** localStorage キー: 非表示にした日時 */
const DISMISSED_KEY = 'pace-pwa-prompt-dismissed';

/** 非表示期間 (7日 = ミリ秒) */
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * BeforeInstallPromptEvent — PWA インストールプロンプトイベント
 *
 * ブラウザがネイティブに提供する型定義が無いため独自宣言。
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  prompt(): Promise<void>;
}

/**
 * PWA インストールプロンプトバナー
 *
 * モバイル端末でのみ表示される。
 * ユーザーが「あとで」を押すと 7 日間非表示にする。
 */
export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // モバイル判定（画面幅 768px 以下）
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

    // 非表示期間チェック
    const dismissedAt = localStorage.getItem(DISMISSED_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - Number(dismissedAt);
      if (elapsed < DISMISS_DURATION_MS) return;
      localStorage.removeItem(DISMISSED_KEY);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setVisible(false);
    setDeferredPrompt(null);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-emerald-600 p-4 shadow-lg">
      <div className="flex items-center justify-between max-w-lg mx-auto gap-3">
        <p className="text-sm text-white font-medium">
          PACEをホーム画面に追加
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors rounded"
          >
            あとで
          </button>
          <button
            onClick={handleInstall}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded transition-colors"
          >
            インストール
          </button>
        </div>
      </div>
    </div>
  );
}
