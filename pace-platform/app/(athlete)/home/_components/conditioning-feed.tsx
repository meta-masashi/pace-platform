'use client';

/**
 * ConditioningFeed — Strava風アクティビティフィードカード
 *
 * 直近7日分のコンディショニングデータをカード形式で表示。
 * 各カードに Fitness / Fatigue / ACWR / Sleep の4メトリクスミニカードと
 * AI インサイトを表示する。
 */

import { useState } from 'react';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface DailyFeedEntry {
  date: string;
  conditioningScore: number | null;
  fitnessEwma: number | null;
  fatigueEwma: number | null;
  acwr: number | null;
  sleepScore: number | null;
  insight?: string;
}

interface ConditioningFeedProps {
  entries: DailyFeedEntry[];
  /** 前日比スコア差分（entries[i] - entries[i-1]） */
  previousScore?: number | null;
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const weekday = weekdays[d.getDay()]!;
  return `${month}月${day}日（${weekday}）`;
}

function scoreDelta(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return '';
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff > 0) return `+${diff}`;
  if (diff < 0) return `${diff}`;
  return '0';
}

function deltaColor(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return 'text-muted-foreground';
  const diff = current - previous;
  if (diff > 0) return 'text-optimal-500';
  if (diff < 0) return 'text-critical-500';
  return 'text-muted-foreground';
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 70) return 'text-optimal-500';
  if (score >= 40) return 'text-watchlist-500';
  return 'text-critical-500';
}

function acwrColor(acwr: number | null): string {
  if (acwr === null) return 'text-muted-foreground';
  if (acwr >= 0.8 && acwr <= 1.3) return 'text-optimal-500';
  if (acwr > 1.3 && acwr <= 1.5) return 'text-watchlist-500';
  return 'text-critical-500';
}

// ---------------------------------------------------------------------------
// ミニメトリクスカード
// ---------------------------------------------------------------------------

function MiniMetric({
  label,
  value,
  unit,
  colorClass,
}: {
  label: string;
  value: string;
  unit?: string;
  colorClass?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-muted/50 px-2.5 py-2">
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${colorClass ?? 'text-foreground'}`}>
        {value}
      </span>
      {unit && <span className="text-[9px] text-muted-foreground">{unit}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// フィードカード
// ---------------------------------------------------------------------------

function FeedCard({
  entry,
  previousScore,
  index,
}: {
  entry: DailyFeedEntry;
  previousScore: number | null;
  index: number;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const delta = scoreDelta(entry.conditioningScore, previousScore);
  const dColor = deltaColor(entry.conditioningScore, previousScore);

  return (
    <div
      className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-primary/30"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* ヘッダー: 日付 + スコア */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">
            {formatDate(entry.date)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold tabular-nums ${scoreColor(entry.conditioningScore)}`}>
            {entry.conditioningScore !== null ? entry.conditioningScore : '--'}
          </span>
          {delta && (
            <span className={`text-xs font-medium tabular-nums ${dColor}`}>
              {delta}
            </span>
          )}
          <svg
            className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* 展開コンテンツ */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {/* 4メトリクスミニカード */}
          <div className="grid grid-cols-4 gap-2">
            <MiniMetric
              label="Fitness"
              value={entry.fitnessEwma !== null ? entry.fitnessEwma.toFixed(1) : '--'}
              colorClass="text-emerald-500"
            />
            <MiniMetric
              label="Fatigue"
              value={entry.fatigueEwma !== null ? entry.fatigueEwma.toFixed(1) : '--'}
              colorClass="text-red-400"
            />
            <MiniMetric
              label="ACWR"
              value={entry.acwr !== null ? entry.acwr.toFixed(2) : '--'}
              colorClass={acwrColor(entry.acwr)}
            />
            <MiniMetric
              label="Sleep"
              value={entry.sleepScore !== null ? `${entry.sleepScore}` : '--'}
              unit="/10"
            />
          </div>

          {/* AI インサイト */}
          {entry.insight && (
            <div className="mt-3 rounded-lg bg-primary/5 px-3 py-2">
              <p className="text-xs leading-relaxed text-foreground">
                {entry.insight}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function ConditioningFeed({ entries, previousScore }: ConditioningFeedProps) {
  if (entries.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-border bg-card">
        <p className="text-sm text-muted-foreground">
          チェックインデータがまだありません
        </p>
      </div>
    );
  }

  // 新しい順に表示
  const sorted = [...entries].reverse();

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        直近のコンディション
      </h3>
      {sorted.map((entry, i) => {
        // 前日のスコアを取得（sorted は新しい順なので i+1 が前日）
        const prevEntry = sorted[i + 1];
        const prevScore = i === 0 && previousScore !== undefined
          ? previousScore
          : (prevEntry?.conditioningScore ?? null);
        return (
          <FeedCard
            key={entry.date}
            entry={entry}
            previousScore={prevScore}
            index={i}
          />
        );
      })}
    </div>
  );
}
