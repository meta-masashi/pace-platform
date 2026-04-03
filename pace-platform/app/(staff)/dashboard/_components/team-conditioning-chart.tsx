'use client';

/**
 * TeamConditioningChart — チームコンディショニング 30日間推移チャート
 *
 * Recharts ComposedChart で Team Score のエリア + スコアバケット帯を表示。
 * YouTube Analytics のメインチャートをイメージした可視化。
 */

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface TeamTrendDataPoint {
  date: string;
  teamScore: number;
  optimalCount: number;
  cautionCount: number;
  recoveryCount: number;
}

interface TeamConditioningChartProps {
  data: TeamTrendDataPoint[];
  onDateClick?: (date: string) => void;
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function TeamConditioningChart({
  data,
  onDateClick,
}: TeamConditioningChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-xl border border-border bg-card">
        <p className="text-sm text-muted-foreground">チームトレンドデータがありません</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">チームコンディション推移</h3>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart
          data={data}
          onClick={(e: { activeLabel?: string }) => {
            if (e?.activeLabel) onDateClick?.(e.activeLabel);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />

          {/* スコアバケット帯 */}
          <ReferenceArea y1={70} y2={100} fill="#10b981" fillOpacity={0.05} />
          <ReferenceArea y1={40} y2={70} fill="#f59e0b" fillOpacity={0.05} />
          <ReferenceArea y1={0} y2={40} fill="#ef4444" fillOpacity={0.05} />

          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            width={30}
          />
          <Tooltip
            labelFormatter={(label: string) => formatShortDate(label)}
            contentStyle={{
              fontSize: 11,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--card)',
            }}
          />

          {/* Team Score エリア */}
          <Area
            type="monotone"
            dataKey="teamScore"
            name="Team Score"
            stroke="#10b981"
            fill="url(#teamScoreGradient)"
            strokeWidth={2}
          />
          <defs>
            <linearGradient id="teamScoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
