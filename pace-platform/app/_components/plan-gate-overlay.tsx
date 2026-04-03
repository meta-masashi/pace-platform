"use client";

/**
 * PlanGateOverlay — Pro+ 専用機能のロック表示
 *
 * gated=true の場合、children を非表示にして
 * ロックアイコン + 機能名 + アップグレード CTA を表示する。
 * ぼかしではなく完全ロック（プレースホルダー表示）。
 */

interface PlanGateOverlayProps {
  gated: boolean;
  children: React.ReactNode;
  featureName: string;
  ctaHref?: string | undefined;
}

function LockIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted-foreground"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

export function PlanGateOverlay({
  gated,
  children,
  featureName,
  ctaHref = "/admin/billing",
}: PlanGateOverlayProps) {
  if (!gated) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
      <LockIcon />
      <p className="text-sm font-semibold text-foreground">{featureName}</p>
      <p className="text-xs text-muted-foreground">
        この機能は Pro プラン以上で利用できます
      </p>
      <a
        href={ctaHref}
        className="mt-1 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        プランをアップグレード
      </a>
    </div>
  );
}
