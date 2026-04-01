'use client';

/**
 * PACE Platform — アスリート履歴ページ
 *
 * 仕様: ConditioningTrendChart + CalendarView
 * コンディショニングスコアの推移と日次データをカレンダー形式で表示。
 */

import { useEffect, useState } from 'react';

interface TrendEntry {
  date: string;
  conditioning_score: number | null;
  fitness_ewma: number | null;
  fatigue_ewma: number | null;
  acwr: number | null;
  srpe: number | null;
}

export default function HistoryPage() {
  const [trend, setTrend] = useState<TrendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [athleteId, setAthleteId] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // まずアスリートIDを取得
        const meRes = await fetch('/api/settings/profile');
        if (!meRes.ok) return;
        const meJson = await meRes.json();
        const id = meJson.data?.athlete_id ?? '';
        setAthleteId(id);
        if (!id) return;

        // トレンドデータ取得
        const res = await fetch(`/api/conditioning/${id}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.data?.trend) {
          setTrend(json.data.trend);
        }
      } catch (err) { void err; // silently handled
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 pt-4">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  // カレンダー用: 直近30日
  const today = new Date();
  const days: { date: string; score: number | null }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]!;
    const entry = trend.find((t) => t.date === dateStr);
    days.push({ date: dateStr, score: entry?.conditioning_score ?? null });
  }

  const selectedEntry = selectedDate
    ? trend.find((t) => t.date === selectedDate)
    : null;

  // スコア→色
  function scoreColor(score: number | null): string {
    if (score === null) return 'bg-muted';
    if (score >= 70) return 'bg-emerald-400';
    if (score >= 50) return 'bg-yellow-400';
    if (score >= 30) return 'bg-orange-400';
    return 'bg-red-400';
  }

  // トレンドチャート（簡易 SVG）
  const validScores = trend.filter((t) => t.conditioning_score !== null);
  const maxScore = 100;
  const chartWidth = 360;
  const chartHeight = 120;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-bold text-foreground">コンディション履歴</h1>

      {/* トレンドチャート */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          スコア推移（直近42日）
        </p>
        {validScores.length > 1 ? (
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full"
            preserveAspectRatio="none"
          >
            {/* グリッドライン */}
            {[25, 50, 75].map((v) => (
              <line
                key={v}
                x1={0}
                y1={chartHeight - (v / maxScore) * chartHeight}
                x2={chartWidth}
                y2={chartHeight - (v / maxScore) * chartHeight}
                stroke="currentColor"
                className="text-muted"
                strokeWidth={0.5}
                strokeDasharray="4,4"
              />
            ))}
            {/* スコアライン */}
            <polyline
              fill="none"
              stroke="currentColor"
              className="text-emerald-500"
              strokeWidth={2}
              points={validScores
                .map((t, i) => {
                  const x = (i / (validScores.length - 1)) * chartWidth;
                  const y = chartHeight - ((t.conditioning_score ?? 0) / maxScore) * chartHeight;
                  return `${x},${y}`;
                })
                .join(' ')}
            />
            {/* エリアフィル */}
            <polygon
              className="text-emerald-500/10"
              fill="currentColor"
              points={`0,${chartHeight} ${validScores
                .map((t, i) => {
                  const x = (i / (validScores.length - 1)) * chartWidth;
                  const y = chartHeight - ((t.conditioning_score ?? 0) / maxScore) * chartHeight;
                  return `${x},${y}`;
                })
                .join(' ')} ${chartWidth},${chartHeight}`}
            />
          </svg>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            データが不足しています。チェックインを続けてください。
          </p>
        )}
      </div>

      {/* カレンダービュー */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          直近30日カレンダー
        </p>
        <div className="grid grid-cols-7 gap-1.5">
          {['月', '火', '水', '木', '金', '土', '日'].map((d) => (
            <div key={d} className="text-center text-[10px] font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {/* オフセット（最初の日の曜日に合わせる） */}
          {days.length > 0 &&
            Array.from({ length: (new Date(days[0]!.date).getDay() + 6) % 7 }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
          {days.map(({ date, score }) => {
            const dayNum = new Date(date).getDate();
            const isSelected = date === selectedDate;
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date === selectedDate ? null : date)}
                className={`flex h-9 w-full flex-col items-center justify-center rounded-md text-[11px] font-medium transition-all ${
                  isSelected
                    ? 'ring-2 ring-primary ring-offset-1'
                    : ''
                } ${scoreColor(score)} ${score !== null ? 'text-white' : 'text-muted-foreground'}`}
              >
                {dayNum}
              </button>
            );
          })}
        </div>
      </div>

      {/* 選択日の詳細 */}
      {selectedEntry && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">
            {selectedDate}
          </p>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-xs text-muted-foreground">スコア</p>
              <p className="text-xl font-bold tabular-nums text-foreground">
                {selectedEntry.conditioning_score?.toFixed(0) ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ACWR</p>
              <p className="text-xl font-bold tabular-nums text-foreground">
                {selectedEntry.acwr?.toFixed(2) ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">フィットネス</p>
              <p className="text-lg font-bold tabular-nums text-foreground">
                {selectedEntry.fitness_ewma?.toFixed(1) ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">疲労</p>
              <p className="text-lg font-bold tabular-nums text-foreground">
                {selectedEntry.fatigue_ewma?.toFixed(1) ?? '—'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
