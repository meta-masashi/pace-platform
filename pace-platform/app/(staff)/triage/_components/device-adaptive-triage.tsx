'use client';

/**
 * Adaptive Design - Layer 2: デバイス別トリアージ・センター
 *
 * タッチデバイス (iPad): Tinder風スワイプカード "The Pitch-side Commander"
 * PC (マウス): 高密度データグリッド "The Data War Room"
 *
 * window.matchMedia("(pointer: coarse)") でコンポーネントを完全にマウントし分ける。
 * Tailwind のブレイクポイントだけでなくデバイス特性で切替。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface TriageAthleteData {
  id: string;
  name: string;
  position?: string;
  number?: number;
  priority: 'critical' | 'watchlist' | 'normal';
  reason: string;
  aiRecommendation: string;
  conditioningScore: number | null;
  tissueDamage: number | null;
  decouplingScore: number | null;
  acwr: number | null;
}

interface DeviceAdaptiveTriageProps {
  athletes: TriageAthleteData[];
  onApprove: (athleteId: string) => void;
  onOverride: (athleteId: string) => void;
  onBulkApprove: (athleteIds: string[]) => void;
}

// ---------------------------------------------------------------------------
// デバイス検出フック
// ---------------------------------------------------------------------------

function useIsTouchDevice(): boolean | null {
  const [isTouch, setIsTouch] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setIsTouch(mq.matches);

    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isTouch;
}

// ---------------------------------------------------------------------------
// iPad: Tinder風スワイプカード (The Pitch-side Commander)
// ---------------------------------------------------------------------------

function SwipeTriageCard({
  athlete,
  onApprove,
  onOverride,
}: {
  athlete: TriageAthleteData;
  onApprove: () => void;
  onOverride: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [swiped, setSwiped] = useState<'left' | 'right' | null>(null);

  const THRESHOLD = 100;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    startRef.current = { x: touch.clientX };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    setDragX(touch.clientX - startRef.current.x);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (Math.abs(dragX) > THRESHOLD) {
      const direction = dragX > 0 ? 'right' : 'left';
      setSwiped(direction);

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(20);
      }

      setTimeout(() => {
        if (direction === 'right') onApprove();
        else onOverride();
      }, 300);
    } else {
      setDragX(0);
    }
    startRef.current = null;
  }, [dragX, onApprove, onOverride]);

  const priorityColor =
    athlete.priority === 'critical'
      ? 'border-l-critical-500'
      : athlete.priority === 'watchlist'
        ? 'border-l-watchlist-500'
        : 'border-l-optimal-500';

  const rotation = dragX * 0.05;

  return (
    <div
      ref={cardRef}
      className={`w-full max-w-lg rounded-2xl border border-l-4 border-border bg-card p-6 shadow-lg ${priorityColor} ${
        swiped === 'left'
          ? 'animate-swipe-left'
          : swiped === 'right'
            ? 'animate-swipe-right'
            : ''
      } motion-reduce:animate-none`}
      style={
        !swiped
          ? {
              transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
              transition: dragX === 0 ? 'transform 0.3s ease' : 'none',
            }
          : undefined
      }
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* スワイプ方向ラベル */}
      <div className="flex justify-between text-xs">
        <span
          className="rounded bg-critical-50 px-2 py-0.5 text-critical-600 transition-opacity"
          style={{ opacity: dragX < -30 ? 1 : 0.15 }}
        >
          却下 / Override
        </span>
        <span
          className="rounded bg-optimal-50 px-2 py-0.5 text-optimal-600 transition-opacity"
          style={{ opacity: dragX > 30 ? 1 : 0.15 }}
        >
          承認 / Approve
        </span>
      </div>

      {/* 選手情報 */}
      <div className="mt-4">
        <div className="flex items-baseline gap-2">
          <h3 className="text-xl font-bold text-foreground">{athlete.name}</h3>
          {athlete.number !== undefined && (
            <span className="text-sm text-muted-foreground">#{athlete.number}</span>
          )}
        </div>
        {athlete.position && (
          <p className="text-sm text-muted-foreground">{athlete.position}</p>
        )}
      </div>

      {/* AI推奨 */}
      <div className="mt-4 rounded-lg bg-muted/50 p-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          AI 推奨アクション
        </p>
        <p className="mt-1 text-sm text-foreground">{athlete.aiRecommendation}</p>
      </div>

      {/* スタッツ行 */}
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        {athlete.conditioningScore !== null && (
          <div>
            <p className="text-[10px] text-muted-foreground">コンディション</p>
            <p className="font-label text-lg font-bold tabular-nums text-foreground">
              {athlete.conditioningScore}
            </p>
          </div>
        )}
        {athlete.acwr !== null && (
          <div>
            <p className="text-[10px] text-muted-foreground">ACWR</p>
            <p className="font-label text-lg font-bold tabular-nums text-foreground">
              {athlete.acwr.toFixed(2)}
            </p>
          </div>
        )}
        {athlete.decouplingScore !== null && (
          <div>
            <p className="text-[10px] text-muted-foreground">デカップリング</p>
            <p className="font-label text-lg font-bold tabular-nums text-foreground">
              {athlete.decouplingScore.toFixed(1)}
            </p>
          </div>
        )}
      </div>

      {/* 理由 */}
      <p className="mt-3 text-xs text-muted-foreground">{athlete.reason}</p>
    </div>
  );
}

function TouchTriageView({
  athletes,
  onApprove,
  onOverride,
}: {
  athletes: TriageAthleteData[];
  onApprove: (id: string) => void;
  onOverride: (id: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleApprove = useCallback(() => {
    const athlete = athletes[currentIndex];
    if (!athlete) return;
    onApprove(athlete.id);
    setCurrentIndex((prev) => Math.min(prev + 1, athletes.length - 1));
  }, [currentIndex, athletes, onApprove]);

  const handleOverride = useCallback(() => {
    const athlete = athletes[currentIndex];
    if (!athlete) return;
    onOverride(athlete.id);
    setCurrentIndex((prev) => Math.min(prev + 1, athletes.length - 1));
  }, [currentIndex, athletes, onOverride]);

  if (athletes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">対象選手はいません</p>
      </div>
    );
  }

  if (currentIndex >= athletes.length) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-optimal-500">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <p className="text-sm font-medium text-foreground">全選手の判定が完了しました</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-xs text-muted-foreground">
        {currentIndex + 1} / {athletes.length}
      </p>
      <SwipeTriageCard
        athlete={athletes[currentIndex]!}
        onApprove={handleApprove}
        onOverride={handleOverride}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PC: データグリッド (The Data War Room)
// ---------------------------------------------------------------------------

function DataGridTriageView({
  athletes,
  onApprove,
  onOverride,
  onBulkApprove,
}: {
  athletes: TriageAthleteData[];
  onApprove: (id: string) => void;
  onOverride: (id: string) => void;
  onBulkApprove: (ids: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkApprove = useCallback(() => {
    onBulkApprove(Array.from(selectedIds));
    setSelectedIds(new Set());
  }, [selectedIds, onBulkApprove]);

  const selectedAthlete = athletes.find((a) => a.id === selectedDetailId);

  const priorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      critical: 'bg-critical-100 text-critical-700',
      watchlist: 'bg-watchlist-100 text-watchlist-700',
      normal: 'bg-optimal-100 text-optimal-700',
    };
    return styles[priority] ?? 'bg-muted text-muted-foreground';
  };

  return (
    <div className="flex gap-4">
      {/* 左ペイン: テーブル */}
      <div className="flex-1 overflow-x-auto">
        {/* バルクアクション */}
        {selectedIds.size > 0 && (
          <div className="mb-3 flex items-center gap-3 rounded-lg bg-muted/50 p-2">
            <span className="text-xs text-muted-foreground">
              {selectedIds.size}名 選択中
            </span>
            <button
              type="button"
              onClick={handleBulkApprove}
              className="rounded bg-optimal-500 px-3 py-1 text-xs font-medium text-white hover:bg-optimal-600"
            >
              一括承認
            </button>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="p-2 w-8">
                <input
                  type="checkbox"
                  checked={selectedIds.size === athletes.length && athletes.length > 0}
                  onChange={() => {
                    if (selectedIds.size === athletes.length) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(athletes.map((a) => a.id)));
                    }
                  }}
                  className="rounded"
                />
              </th>
              <th className="p-2">選手名</th>
              <th className="p-2">優先度</th>
              <th className="p-2">AI推奨</th>
              <th className="p-2 text-right">ACWR</th>
              <th className="p-2 text-right">D(t)</th>
              <th className="p-2 text-right">デカップリング</th>
              <th className="p-2">アクション</th>
            </tr>
          </thead>
          <tbody>
            {athletes.map((a) => (
              <tr
                key={a.id}
                onClick={() => setSelectedDetailId(a.id)}
                className={`cursor-pointer border-b border-border transition-colors hover:bg-muted/30 ${
                  selectedDetailId === a.id ? 'bg-muted/50' : ''
                }`}
              >
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSelect(a.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded"
                  />
                </td>
                <td className="p-2 font-medium">{a.name}</td>
                <td className="p-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityBadge(a.priority)}`}>
                    {a.priority === 'critical' ? 'CRITICAL' : a.priority === 'watchlist' ? 'WATCH' : 'NORMAL'}
                  </span>
                </td>
                <td className="p-2 text-xs text-muted-foreground max-w-[200px] truncate">
                  {a.aiRecommendation}
                </td>
                <td className="p-2 text-right font-label tabular-nums">
                  {a.acwr !== null ? a.acwr.toFixed(2) : '-'}
                </td>
                <td className="p-2 text-right font-label tabular-nums">
                  {a.tissueDamage !== null ? `${a.tissueDamage}%` : '-'}
                </td>
                <td className="p-2 text-right font-label tabular-nums">
                  {a.decouplingScore !== null ? a.decouplingScore.toFixed(1) : '-'}
                </td>
                <td className="p-2">
                  <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onApprove(a.id)}
                      className="rounded bg-optimal-100 px-2 py-1 text-[10px] font-medium text-optimal-700 hover:bg-optimal-200"
                    >
                      承認
                    </button>
                    <button
                      type="button"
                      onClick={() => onOverride(a.id)}
                      className="rounded bg-critical-100 px-2 py-1 text-[10px] font-medium text-critical-700 hover:bg-critical-200"
                    >
                      却下
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 右ペイン: インスペクター */}
      {selectedAthlete && (
        <div className="hidden w-80 shrink-0 rounded-lg border border-border bg-card p-4 lg:block">
          <h3 className="text-base font-bold text-foreground">{selectedAthlete.name}</h3>
          <p className="text-xs text-muted-foreground">
            {selectedAthlete.position} {selectedAthlete.number !== undefined ? `#${selectedAthlete.number}` : ''}
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                AI 推奨
              </p>
              <p className="mt-1 text-sm text-foreground">{selectedAthlete.aiRecommendation}</p>
            </div>

            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                アラート理由
              </p>
              <p className="mt-1 text-sm text-foreground">{selectedAthlete.reason}</p>
            </div>

            {selectedAthlete.tissueDamage !== null && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  組織ダメージ D(t)
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-critical-500 transition-all duration-500"
                      style={{ width: `${selectedAthlete.tissueDamage}%` }}
                    />
                  </div>
                  <span className="font-label text-sm font-bold tabular-nums">
                    {selectedAthlete.tissueDamage}%
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => onApprove(selectedAthlete.id)}
                className="flex-1 rounded-lg bg-optimal-500 py-2 text-sm font-medium text-white hover:bg-optimal-600"
              >
                承認
              </button>
              <button
                type="button"
                onClick={() => onOverride(selectedAthlete.id)}
                className="flex-1 rounded-lg bg-critical-500 py-2 text-sm font-medium text-white hover:bg-critical-600"
              >
                却下
              </button>
            </div>

            <Link
              href={`/athletes/${selectedAthlete.id}`}
              className="block text-center text-xs text-primary hover:underline"
            >
              詳細を表示 →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function DeviceAdaptiveTriage({
  athletes,
  onApprove,
  onOverride,
  onBulkApprove,
}: DeviceAdaptiveTriageProps) {
  const isTouch = useIsTouchDevice();

  // デバイス検出中
  if (isTouch === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  // タッチデバイス: スワイプUI
  if (isTouch) {
    return (
      <TouchTriageView
        athletes={athletes}
        onApprove={onApprove}
        onOverride={onOverride}
      />
    );
  }

  // PC: データグリッドUI
  return (
    <DataGridTriageView
      athletes={athletes}
      onApprove={onApprove}
      onOverride={onOverride}
      onBulkApprove={onBulkApprove}
    />
  );
}
