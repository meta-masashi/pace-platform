/**
 * components/ui/skeleton.tsx
 * ============================================================
 * PACE Platform — スケルトンローディングコンポーネント
 *
 * コンテンツ読み込み中のプレースホルダー表示。
 * シマーアニメーション付き。
 * ============================================================
 */

'use client';

import { type HTMLAttributes } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** 円形にする */
  circle?: boolean;
}

export function Skeleton({ className = '', circle, ...props }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-muted ${circle ? 'rounded-full' : 'rounded-md'} ${className}`}
      {...props}
    />
  );
}

/**
 * テキスト行のスケルトン
 */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}
