'use client';

/**
 * PACE Platform — レポートビューア コンポーネント
 *
 * 生成されたレポート HTML を iframe でプレビューし、
 * ブラウザの印刷機能（window.print）で PDF 保存を行う。
 */

import { useRef, useState } from 'react';

interface ReportViewerProps {
  /** レポート HTML の URL（空の場合は未生成状態） */
  reportUrl: string;
  /** ローディング中か */
  loading: boolean;
}

/**
 * レポートプレビュー＆印刷コンポーネント
 */
export function ReportViewer({ reportUrl, loading }: ReportViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  /**
   * iframe 内のドキュメントを印刷する（PDF 保存ダイアログを表示）
   */
  function handlePrint() {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.print();
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg border border-border bg-card">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">
            レポートを生成中...
          </span>
        </div>
      </div>
    );
  }

  if (!reportUrl) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg border border-dashed border-border bg-card">
        <p className="text-sm text-muted-foreground">
          レポートを選択して生成ボタンを押してください
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* コントロールバー */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">プレビュー</span>
        <button
          type="button"
          onClick={handlePrint}
          disabled={!iframeLoaded}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          印刷 / PDF保存
        </button>
      </div>

      {/* iframe プレビュー */}
      <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
        <iframe
          ref={iframeRef}
          src={reportUrl}
          title="レポートプレビュー"
          sandbox="allow-same-origin"
          className="h-[700px] w-full"
          onLoad={() => setIframeLoaded(true)}
        />
      </div>
    </div>
  );
}
