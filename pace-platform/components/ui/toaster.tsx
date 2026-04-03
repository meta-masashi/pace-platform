/**
 * components/ui/toaster.tsx
 * ============================================================
 * PACE Platform — グローバルトースト通知
 *
 * sonner ベース。ルートレイアウトに `<PaceToaster />` を配置する。
 * API エラー時に traceId 付きでユーザーに表示。
 * ============================================================
 */

'use client';

import { Toaster } from 'sonner';

export function PaceToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        // エラートースト — 赤系
        classNames: {
          error: 'bg-red-50 border-red-200 text-red-900',
          warning: 'bg-amber-50 border-amber-200 text-amber-900',
          success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
          info: 'bg-blue-50 border-blue-200 text-blue-900',
        },
        duration: 5000,
      }}
      richColors
      closeButton
    />
  );
}
