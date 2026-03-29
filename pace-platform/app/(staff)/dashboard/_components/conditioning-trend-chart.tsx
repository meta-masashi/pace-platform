'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export interface ConditioningDataPoint {
  date: string;
  score: number;
}

interface ConditioningTrendChartProps {
  data: ConditioningDataPoint[];
}

export function ConditioningTrendChart({ data }: ConditioningTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        データがありません
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold">
        チーム・コンディション推移（14日間）
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="conditioningGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(160 15% 90%)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
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
            formatter={(value: any) => [value.toFixed(1), 'スコア']}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#14b8a6"
            strokeWidth={2}
            fill="url(#conditioningGradient)"
            dot={{ r: 3, fill: '#14b8a6' }}
            activeDot={{ r: 5, fill: '#0d9488' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
