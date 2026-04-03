/**
 * hooks/use-share.ts
 * ============================================================
 * Web Share API フック
 *
 * navigator.share() を使用したネイティブ共有ダイアログ。
 * 未対応ブラウザではクリップボードコピーにフォールバック。
 * ============================================================
 */

'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';

interface ShareData {
  title?: string;
  text?: string;
  url?: string;
}

export function useShare() {
  const isSupported = typeof navigator !== 'undefined' && 'share' in navigator;

  const share = useCallback(async (data: ShareData): Promise<boolean> => {
    // Web Share API が使える場合
    if (isSupported) {
      try {
        await navigator.share(data);
        return true;
      } catch (err) {
        // ユーザーがキャンセルした場合は silent
        if (err instanceof Error && err.name === 'AbortError') {
          return false;
        }
        // フォールスルーでクリップボードにコピー
      }
    }

    // フォールバック: URL をクリップボードにコピー
    const textToCopy = data.url ?? data.text ?? '';
    if (textToCopy && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        toast.success('リンクをコピーしました');
        return true;
      } catch {
        toast.error('コピーに失敗しました');
        return false;
      }
    }

    return false;
  }, [isSupported]);

  return { share, isSupported };
}
