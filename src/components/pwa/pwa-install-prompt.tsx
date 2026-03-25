"use client";

import { useCallback, useEffect, useState } from "react";

const DISMISSED_KEY = "pace-pwa-prompt-dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  prompt(): Promise<void>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as never)["standalone"]);
    if (isStandalone) return;

    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

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

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
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
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-brand-600 p-4 shadow-lg animate-slide-up">
      <div className="flex items-center justify-between max-w-lg mx-auto gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
            P
          </div>
          <p className="text-sm text-white font-medium">
            PACEをホーム画面に追加
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors rounded"
          >
            あとで
          </button>
          <button
            onClick={handleInstall}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-colors"
          >
            インストール
          </button>
        </div>
      </div>
    </div>
  );
}
