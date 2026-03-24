'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';

export interface AcwrDataPoint {
  date: string;
  acwr: number;
}

interface AcwrTrendChartProps {
  data: AcwrDataPoint[];
}

export function AcwrTrendChart({ data }: AcwrTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        データがありません
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold">ACWR トレンド（チーム平均）</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(160 15% 90%)"
            vertical={false}
          />

          {/* Optimal zone (green) */}
          <ReferenceArea
            y1={0.8}
            y2={1.3}
            fill="#10b981"
            fillOpacity={0.08}
          />

          {/* Warning zone (amber) */}
          <ReferenceArea
            y1={1.3}
            y2={1.5}
            fill="#f59e0b"
            fillOpacity={0.08}
          />

          {/* Danger zone (red) */}
          <ReferenceArea
            y1={1.5}
            y2={2.5}
            fill="#ef4444"
            fillOpacity={0.06}
          />

          {/* Overload threshold */}
          <ReferenceLine
            y={1.5}
            stroke="#f59e0b"
            strokeDasharray="6 4"
            strokeWidth={2}
            label={{
              value: '過負荷閾値 1.5',
              position: 'insideTopRight',
              fill: '#d97706',
              fontSize: 11,
            }}
          />

          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 2.5]}
            ticks={[0, 0.5, 0.8, 1.0, 1.3, 1.5, 2.0, 2.5]}
            tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
            tickLine={false}
            axisLine={false}
            width={35}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(0 0% 100%)',
              border: '1px solid hsl(160 15% 90%)',
              borderRadius: '0.375rem',
              fontSize: '0.8125rem',
            }}
            labelFormatter={(label) => `日付: ${label}`}
            formatter={(value: number) => [value.toFixed(2), 'ACWR']}
          />
          <Line
            type="monotone"
            dataKey="acwr"
            stroke="#059669"
            strokeWidth={2}
            dot={{ r: 3, fill: '#059669' }}
            activeDot={{ r: 5, fill: '#059669' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
