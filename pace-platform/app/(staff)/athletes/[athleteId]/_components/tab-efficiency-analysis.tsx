'use client';

/**
 * 運動効率分析タブ (Tab 2)
 *
 * - 総合効率スコア（ドーナツ風ゲージ）
 * - Decoupling Index トレンド（14日間）
 * - 主観-客観ギャップテーブル（7日間）
 * - Z-Score ウェルネスレーダー（sleep / fatigue / mood）
 * - パフォーマンス効率 KPI カード群
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import type { EfficiencyAnalysisData } from './assessment-tabs';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** 総合効率スコア ゲージ（SVG リング） */
function EfficiencyGauge({ score }: { score: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(score, 0), 100);
  const offset = circumference - (pct / 100) * circumference;

  const color =
    score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  const label =
    score >= 70 ? '良好' : score >= 40 ? '注意' : '要対応';

  return (
    <div className="flex flex-col items-center">
      <svg width={128} height={128} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={64}
          cy={64}
          r={radius}
          fill="none"
          stroke="hsl(160 15% 90%)"
          strokeWidth={10}
        />
        {/* Score ring */}
        <circle
          cx={64}
          cy={64}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="-mt-[88px] flex flex-col items-center">
        <span className="text-3xl font-bold tabular-nums text-foreground">{score}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

/** 効率 KPI カード */
function EfficiencyKpi({
  label,
  current,
  average,
  deviationPercent,
  unit,
}: {
  label: string;
  current: number;
  average: number;
  deviationPercent: number;
  unit?: string;
}) {
  const isAlert = Math.abs(deviationPercent) > 15;
  const arrow = deviationPercent > 0 ? '↑' : deviationPercent < 0 ? '↓' : '→';
  const deviationColor =
    Math.abs(deviationPercent) > 15
      ? 'text-critical-500'
      : Math.abs(deviationPercent) > 10
        ? 'text-watchlist-500'
        : 'text-optimal-500';

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-xl font-bold tabular-nums ${isAlert ? 'text-critical-500' : 'text-foreground'}`}>
          {current.toFixed(1)}
          {unit && <span className="ml-0.5 text-sm font-normal text-muted-foreground">{unit}</span>}
        </span>
        <span className={`text-xs font-medium ${deviationColor}`}>
          {arrow} {Math.abs(deviationPercent).toFixed(1)}%
        </span>
      </div>
      <p className="mt-0.5 text-2xs text-muted-foreground">
        平均: {average.toFixed(1)}{unit ?? ''}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

function DecouplingTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-0.5 text-muted-foreground">
        乖離度: <span className="font-bold tabular-nums text-foreground">{payload[0].value.toFixed(1)}%</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface EfficiencyAnalysisTabProps {
  data: EfficiencyAnalysisData;
}

export function EfficiencyAnalysisTab({ data }: EfficiencyAnalysisTabProps) {
  // Decoupling trend
  const decouplingChartData = data.decoupling.trend.map((d) => ({
    date: d.date.slice(5),
    value: d.value,
  }));

  // Z-Score radar data
  const zScoreLabels: Record<string, string> = {
    sleep: '睡眠',
    fatigue: '疲労',
    mood: '気分',
    stress: 'ストレス',
    soreness: '筋肉痛',
  };

  const radarData = Object.entries(data.zScores).map(([key, value]) => ({
    axis: zScoreLabels[key] ?? key,
    value: Math.min(Math.max(value, -3), 3), // clamp -3 ~ 3
    fullMark: 3,
  }));

  // Gap table
  const gapTableData = data.subjectiveObjectiveGap.slice(-7);

  return (
    <div className="space-y-4">
      {/* ---- Score + Alert count header ---- */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Gauge */}
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            総合効率スコア
          </p>
          <EfficiencyGauge score={data.overallEfficiencyScore} />
        </div>

        {/* Decoupling KPI */}
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">心拍-出力の乖離度</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${data.decoupling.current > 5 ? 'text-critical-500' : 'text-foreground'}`}>
            {data.decoupling.current.toFixed(1)}
            <span className="ml-0.5 text-sm font-normal text-muted-foreground">%</span>
          </p>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {data.decoupling.current > 5 ? '⚠ 心拍に対し出力が低下傾向' : '心拍と出力のバランスは良好'}
          </p>
        </div>

        {/* Z-Score alert count */}
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">コンディション異常値</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${data.zScoreAlertCount > 0 ? 'text-watchlist-500' : 'text-optimal-500'}`}>
            {data.zScoreAlertCount}
            <span className="ml-1 text-sm font-normal text-muted-foreground">/ {Object.keys(data.zScores).length} 項目</span>
          </p>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            個人平均から大きく外れた指標数
          </p>
        </div>
      </div>

      {/* ---- Decoupling Trend + Z-Score Radar ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Decoupling trend */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            心拍-出力の乖離度 推移（直近14日間）
          </h4>
          {decouplingChartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={decouplingChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(160 15% 90%)" vertical={false} />
                <ReferenceLine
                  y={5}
                  stroke="#f59e0b"
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={{
                    value: '注意ライン 5%',
                    position: 'insideTopRight',
                    fill: '#d97706',
                    fontSize: 10,
                  }}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 'auto']}
                  tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                  unit="%"
                />
                <Tooltip content={<DecouplingTooltip />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ r: 2, fill: '#8b5cf6' }}
                  activeDot={{ r: 5, fill: '#8b5cf6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              データ不足
            </div>
          )}
        </div>

        {/* Z-Score Radar */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            コンディション指標レーダー
          </h4>
          {radarData.length >= 3 ? (
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="hsl(160 15% 90%)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
                />
                <PolarRadiusAxis
                  domain={[-3, 3]}
                  tick={{ fontSize: 9, fill: 'hsl(160 5% 45%)' }}
                  axisLine={false}
                />
                <Radar
                  dataKey="value"
                  stroke="#06b6d4"
                  fill="#06b6d4"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              データ不足
            </div>
          )}
        </div>
      </div>

      {/* ---- Subjective-Objective Gap Table ---- */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          主観と客観データの差（直近7日）
        </h4>
        {gapTableData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">日付</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">体感負荷</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">心拍計測値</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">乖離率</th>
                </tr>
              </thead>
              <tbody>
                {gapTableData.map((row) => {
                  const gapAlert = Math.abs(row.gapPercent) > 20;
                  return (
                    <tr key={row.date} className="border-b border-border/50 last:border-0">
                      <td className="px-2 py-2 text-muted-foreground">{row.date.slice(5)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-foreground">{row.srpe.toFixed(0)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-foreground">{row.hrBased.toFixed(0)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums font-medium ${gapAlert ? 'text-critical-500' : 'text-muted-foreground'}`}>
                        {row.gapPercent > 0 ? '+' : ''}{row.gapPercent.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
            データなし
          </div>
        )}
      </div>

      {/* ---- Performance Efficiency KPIs ---- */}
      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          運動パフォーマンス効率
        </h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <EfficiencyKpi
            label="心拍あたりの出力"
            current={data.performanceEfficiency.outputPerHrCost.current}
            average={data.performanceEfficiency.outputPerHrCost.average}
            deviationPercent={data.performanceEfficiency.outputPerHrCost.deviationPercent}
          />
          <EfficiencyKpi
            label="体感負荷と実際の負荷の比率"
            current={data.performanceEfficiency.srpeToLoadRatio.current}
            average={data.performanceEfficiency.srpeToLoadRatio.average}
            deviationPercent={data.performanceEfficiency.srpeToLoadRatio.deviationPercent}
          />
          <EfficiencyKpi
            label="運動後の心拍回復"
            current={data.performanceEfficiency.recoveryHr.current}
            average={data.performanceEfficiency.recoveryHr.average}
            deviationPercent={data.performanceEfficiency.recoveryHr.deviationPercent}
            unit="bpm"
          />
          <EfficiencyKpi
            label="睡眠の質"
            current={data.performanceEfficiency.sleepEfficiency.current}
            average={data.performanceEfficiency.sleepEfficiency.average}
            deviationPercent={data.performanceEfficiency.sleepEfficiency.deviationPercent}
            unit="%"
          />
        </div>
      </div>
    </div>
  );
}
