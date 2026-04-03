'use client';

/**
 * 負荷集中分析タブ (Tab 1)
 *
 * - ACWR トレンド（28日間）+ 適正ゾーン表示
 * - 急性/慢性負荷 KPI + 変化率
 * - Monotony 週間推移
 * - Strain 値
 * - 組織ダメージゲージ（4カテゴリ）
 * - Preparedness トレンドライン
 */

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
import type { LoadAnalysisData } from './assessment-tabs';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** KPI カード */
function KpiCard({
  label,
  value,
  unit,
  sub,
  alert,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${alert ? 'text-critical-500' : 'text-foreground'}`}>
        {value}
        {unit && <span className="ml-0.5 text-sm font-normal text-muted-foreground">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 text-2xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** 組織ダメージゲージ */
function TissueDamageGauge({
  data,
}: {
  data: Record<string, { value: number; halfLifeDays: number }>;
}) {
  const categories: { key: string; label: string; color: string }[] = [
    { key: 'metabolic', label: '代謝疲労（エネルギー系）', color: 'bg-watchlist-500' },
    { key: 'structural_soft', label: '筋・腱・靭帯（軟部組織）', color: 'bg-critical-500' },
    { key: 'structural_hard', label: '骨・関節（硬組織）', color: 'bg-critical-500/70' },
    { key: 'neuromotor', label: '神経-筋協調（動作制御）', color: 'bg-cyber-cyan-500' },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        身体へのダメージ推定
      </h4>
      <div className="mt-3 space-y-3">
        {categories.map(({ key, label, color }) => {
          const entry = data[key];
          if (!entry) return null;
          const pct = Math.min(entry.value * 100, 100);
          const isHigh = entry.value > 0.7;
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">{label}</span>
                <div className="flex items-baseline gap-1">
                  <span className={`text-sm font-bold tabular-nums ${isHigh ? 'text-critical-500' : 'text-foreground'}`}>
                    {(entry.value * 100).toFixed(0)}%
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    回復目安 {entry.halfLifeDays}日
                  </span>
                </div>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

function AcwrTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-0.5 text-muted-foreground">
        負荷バランス: <span className="font-bold tabular-nums text-foreground">{payload[0].value.toFixed(2)}</span>
      </p>
    </div>
  );
}

function MonotonyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-0.5 text-muted-foreground">
        単調さ: <span className="font-bold tabular-nums text-foreground">{payload[0].value.toFixed(2)}</span>
      </p>
    </div>
  );
}

function PreparednessTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-0.5 text-muted-foreground">
        準備状態: <span className="font-bold tabular-nums text-foreground">{payload[0].value.toFixed(0)}%</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface LoadAnalysisTabProps {
  data: LoadAnalysisData;
}

export function LoadAnalysisTab({ data }: LoadAnalysisTabProps) {
  const acwrAlert = data.acwr.current > 1.5;
  const monotonyAlert = data.monotony.current > 2.0;
  const acuteChangeAlert = Math.abs(data.acuteLoadChangePercent) > 15;

  // Format ACWR trend dates for display
  const acwrChartData = data.acwr.trend.map((d) => ({
    date: d.date.slice(5), // MM-DD
    value: d.value,
  }));

  // Monotony weekly data
  const monotonyChartData = data.monotony.trend.map((d) => ({
    week: d.week,
    value: d.value,
  }));

  // Preparedness trend
  const preparednessChartData = data.preparedness.trend.map((d) => ({
    date: d.date.slice(5),
    value: d.value,
  }));

  return (
    <div className="space-y-4">
      {/* ---- KPI row ---- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="負荷バランス（ACWR）"
          value={data.acwr.current.toFixed(2)}
          alert={acwrAlert}
          sub={acwrAlert ? '⚠ 直近の負荷が慢性水準を大幅に超過' : '直近と慢性の負荷比率は適正範囲内'}
        />
        <KpiCard
          label="直近7日の負荷量"
          value={data.acuteLoad.toFixed(0)}
          unit="AU"
          sub={`前週比: ${data.acuteLoadChangePercent > 0 ? '+' : ''}${data.acuteLoadChangePercent.toFixed(1)}%${acuteChangeAlert ? '（急増注意）' : ''}`}
          alert={acuteChangeAlert}
        />
        <KpiCard
          label="練習の単調さ"
          value={data.monotony.current.toFixed(2)}
          alert={monotonyAlert}
          sub={monotonyAlert ? '⚠ 負荷の日変動が少なく疲労が蓄積しやすい' : '負荷に適度なメリハリあり'}
        />
        <KpiCard
          label="蓄積疲労度"
          value={data.strain.toFixed(0)}
          unit="AU"
          sub="週間負荷 × 単調さ（高いほど回復が必要）"
        />
      </div>

      {/* ---- ACWR Trend Chart ---- */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          負荷バランス推移（直近28日間）
        </h4>
        {acwrChartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={acwrChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(160 15% 90%)" vertical={false} />

              {/* Optimal zone */}
              <ReferenceArea y1={0.8} y2={1.3} fill="#10b981" fillOpacity={0.08} />
              {/* Warning zone */}
              <ReferenceArea y1={1.3} y2={1.5} fill="#f59e0b" fillOpacity={0.08} />
              {/* Danger zone */}
              <ReferenceArea y1={1.5} y2={2.5} fill="#ef4444" fillOpacity={0.06} />

              <ReferenceLine
                y={1.5}
                stroke="#f59e0b"
                strokeDasharray="6 4"
                strokeWidth={2}
                label={{
                  value: '過負荷ライン 1.5',
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
              <Tooltip content={<AcwrTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#059669"
                strokeWidth={2}
                dot={{ r: 2, fill: '#059669' }}
                activeDot={{ r: 5, fill: '#059669' }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            データ不足
          </div>
        )}
      </div>

      {/* ---- Monotony & Preparedness row ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Monotony weekly bar */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            練習の単調さ 週間推移
          </h4>
          {monotonyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monotonyChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(160 15% 90%)" vertical={false} />
                <ReferenceLine
                  y={2.0}
                  stroke="#ef4444"
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={{
                    value: '注意ライン 2.0',
                    position: 'insideTopRight',
                    fill: '#ef4444',
                    fontSize: 10,
                  }}
                />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 3]}
                  tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <Tooltip content={<MonotonyTooltip />} />
                <Bar
                  dataKey="value"
                  radius={[4, 4, 0, 0]}
                  fill="#f59e0b"
                  fillOpacity={0.7}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              データ不足
            </div>
          )}
        </div>

        {/* Preparedness trend */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            コンディション準備度の推移
          </h4>
          {preparednessChartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={preparednessChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(160 15% 90%)" vertical={false} />
                <ReferenceArea y1={70} y2={100} fill="#10b981" fillOpacity={0.06} />
                <ReferenceArea y1={40} y2={70} fill="#f59e0b" fillOpacity={0.06} />
                <ReferenceArea y1={0} y2={40} fill="#ef4444" fillOpacity={0.06} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <Tooltip content={<PreparednessTooltip />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={{ r: 2, fill: '#06b6d4' }}
                  activeDot={{ r: 5, fill: '#06b6d4' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              データ不足
            </div>
          )}
        </div>
      </div>

      {/* ---- Tissue Damage ---- */}
      <TissueDamageGauge data={data.tissueDamage} />
    </div>
  );
}
