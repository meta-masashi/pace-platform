'use client';

import dynamic from 'next/dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineDataPoint {
  date: string;
  baseline: number;
  intervention: number;
}

interface ScenarioTimelineChartProps {
  data: TimelineDataPoint[];
  targetDate: string | null;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Inner chart (loaded dynamically)
// ---------------------------------------------------------------------------

function TimelineChartInner({
  data,
  targetDate,
}: {
  data: TimelineDataPoint[];
  targetDate: string | null;
}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    AreaChart,
    Area,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip: RTooltip,
    ReferenceLine,
    ResponsiveContainer,
  } = require('recharts');

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
      >
        <defs>
          <linearGradient id="riskReductionGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />

        <XAxis
          dataKey="date"
          tick={{ fontSize: 10 }}
          tickMargin={6}
          stroke="hsl(var(--muted-foreground))"
          opacity={0.6}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 10 }}
          tickMargin={4}
          stroke="hsl(var(--muted-foreground))"
          opacity={0.6}
          tickFormatter={(v: number) => `${v}%`}
        />

        <RTooltip
          content={<CustomTooltip />}
          cursor={{
            stroke: 'hsl(var(--muted-foreground))',
            strokeWidth: 1,
            opacity: 0.3,
          }}
        />

        {/* 15% risk threshold */}
        <ReferenceLine
          y={15}
          stroke="#f59e0b"
          strokeDasharray="6 3"
          strokeOpacity={0.5}
          label={{
            value: 'リスク閾値 15%',
            position: 'insideTopRight',
            fontSize: 10,
            fill: '#f59e0b',
          }}
        />

        {/* Match day marker */}
        {targetDate && (
          <ReferenceLine
            x={targetDate}
            stroke="#ef4444"
            strokeDasharray="4 4"
            strokeOpacity={0.7}
            label={{
              value: '試合日',
              position: 'insideTopLeft',
              fontSize: 10,
              fill: '#ef4444',
            }}
          />
        )}

        {/* Intervention area (risk reduction zone) */}
        <Area
          type="monotone"
          dataKey="intervention"
          stroke="none"
          fill="url(#riskReductionGrad)"
          fillOpacity={1}
        />

        {/* Baseline line (gray dashed) */}
        <Line
          type="monotone"
          dataKey="baseline"
          stroke="#9ca3af"
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2 }}
        />

        {/* Intervention line (emerald solid) */}
        <Line
          type="monotone"
          dataKey="intervention"
          stroke="#10b981"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Dynamic import wrapper to avoid SSR
const DynamicTimelineChart = dynamic(
  () => Promise.resolve(TimelineChartInner),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const baseline = payload.find((p) => p.dataKey === 'baseline');
  const intervention = payload.find((p) => p.dataKey === 'intervention');
  const diff =
    baseline && intervention
      ? (intervention.value - baseline.value).toFixed(1)
      : null;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      {baseline && (
        <p className="text-xs">
          <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />{' '}
          <span className="text-muted-foreground">現在: </span>
          <span className="font-bold tabular-nums">
            {baseline.value.toFixed(1)}%
          </span>
        </p>
      )}
      {intervention && (
        <p className="text-xs">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />{' '}
          <span className="text-muted-foreground">介入後: </span>
          <span className="font-bold tabular-nums">
            {intervention.value.toFixed(1)}%
          </span>
        </p>
      )}
      {diff && (
        <p
          className={`mt-1 border-t border-border pt-1 text-xs font-bold tabular-nums ${
            Number(diff) < 0 ? 'text-optimal-600' : 'text-critical-600'
          }`}
        >
          差: {Number(diff) > 0 ? '+' : ''}
          {diff}%
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported component
// ---------------------------------------------------------------------------

export function ScenarioTimelineChart({
  data,
  targetDate,
  loading,
}: ScenarioTimelineChartProps) {
  if (loading) {
    return (
      <div className="h-72 animate-pulse rounded-lg border border-border bg-card" />
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-border bg-card">
        <p className="text-sm text-muted-foreground">
          介入パラメータを調整するとタイムラインが表示されます
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">
        リスクタイムライン
      </h3>
      <div className="h-64">
        <DynamicTimelineChart data={data} targetDate={targetDate} />
      </div>
    </div>
  );
}
