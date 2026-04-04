'use client';

/**
 * 疼痛パターン分析タブ (Tab 3)
 *
 * - NRS推移 × 負荷相関（2軸ラインチャート）
 * - 疼痛パターン検出（アラートカード）
 * - 既往歴照合（テーブル）
 * - ボディマップ（プレースホルダー）
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { PainAnalysisData } from './assessment-tabs';

// ---------------------------------------------------------------------------
// Custom Tooltips
// ---------------------------------------------------------------------------

function NrsTrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="mt-0.5 text-muted-foreground">
          {entry.dataKey === 'nrs' ? '痛みの強さ' : '体感負荷'}:{' '}
          <span className="font-bold tabular-nums text-foreground">
            {entry.dataKey === 'nrs' ? entry.value.toFixed(1) : entry.value.toFixed(0)}
          </span>
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** 相関係数バッジ */
function CorrelationBadge({ value }: { value: number }) {
  const absValue = Math.abs(value);
  const { color, label } =
    absValue >= 0.7
      ? { color: 'bg-critical-500/10 text-critical-500 border-critical-500/30', label: '負荷依存性の痛み' }
      : absValue >= 0.4
        ? { color: 'bg-watchlist-500/10 text-watchlist-500 border-watchlist-500/30', label: '中程度の関連' }
        : { color: 'bg-optimal-500/10 text-optimal-500 border-optimal-500/30', label: '低相関' };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${color}`}>
      r = {value.toFixed(2)}
      <span className="text-2xs font-normal">({label})</span>
    </span>
  );
}

/** 疼痛パターンアラートカード */
function PatternAlertCard({ text, variant = 'info' }: { text: string; variant?: 'info' | 'warning' }) {
  const styles =
    variant === 'warning'
      ? 'border-watchlist-500/30 bg-watchlist-500/5'
      : 'border-critical-500/30 bg-critical-500/5';
  const iconColor = variant === 'warning' ? 'text-watchlist-500' : 'text-critical-500';

  return (
    <div className={`rounded-lg border p-4 ${styles}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 text-sm ${iconColor}`}>
          {variant === 'warning' ? '⚠' : '🔴'}
        </span>
        <p className="text-sm text-foreground">{text}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

function severityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'severe':
      return 'text-critical-500';
    case 'moderate':
      return 'text-watchlist-500';
    case 'mild':
    default:
      return 'text-muted-foreground';
  }
}

function severityLabel(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'severe':
      return '重度';
    case 'moderate':
      return '中等度';
    case 'mild':
      return '軽度';
    default:
      return severity;
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface PainAnalysisTabProps {
  data: PainAnalysisData;
}

export function PainAnalysisTab({ data }: PainAnalysisTabProps) {
  // Format NRS trend for chart
  const nrsChartData = data.nrsTrend.map((d) => ({
    date: d.date.slice(5), // MM-DD
    nrs: d.nrs,
    srpe: d.srpe,
  }));

  const hasPatterns = data.patterns.length > 0 || data.compensationAlert !== null;

  return (
    <div className="space-y-4">
      {/* ---- Section 1: NRS推移 × 負荷相関 ---- */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            痛みの強さと負荷の推移
          </h4>
          <CorrelationBadge value={data.nrsLoadCorrelation} />
        </div>
        {nrsChartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={nrsChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(160 15% 90%)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
                tickLine={false}
                axisLine={false}
              />
              {/* Left Y-axis: NRS 0-10 */}
              <YAxis
                yAxisId="nrs"
                domain={[0, 10]}
                ticks={[0, 2, 4, 6, 8, 10]}
                tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
                tickLine={false}
                axisLine={false}
                width={30}
                label={{
                  value: 'NRS',
                  angle: -90,
                  position: 'insideLeft',
                  fill: '#ef4444',
                  fontSize: 10,
                }}
              />
              {/* Right Y-axis: sRPE 0-1000 */}
              <YAxis
                yAxisId="srpe"
                orientation="right"
                domain={[0, 1000]}
                ticks={[0, 250, 500, 750, 1000]}
                tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
                tickLine={false}
                axisLine={false}
                width={45}
                label={{
                  value: 'sRPE',
                  angle: 90,
                  position: 'insideRight',
                  fill: '#f59e0b',
                  fontSize: 10,
                }}
              />
              <Tooltip content={<NrsTrendTooltip />} />
              <Line
                yAxisId="nrs"
                type="monotone"
                dataKey="nrs"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 2, fill: '#ef4444' }}
                activeDot={{ r: 5, fill: '#ef4444' }}
                name="NRS"
              />
              <Line
                yAxisId="srpe"
                type="monotone"
                dataKey="srpe"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 2, fill: '#f59e0b' }}
                activeDot={{ r: 5, fill: '#f59e0b' }}
                name="sRPE"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            データ不足
          </div>
        )}
      </div>

      {/* ---- Section 2: 疼痛パターン検出 ---- */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          疼痛パターン検出
        </h4>
        {hasPatterns ? (
          <div className="space-y-3">
            {data.patterns.map((pattern, i) => (
              <PatternAlertCard key={i} text={pattern} variant="info" />
            ))}
            {data.compensationAlert && (
              <PatternAlertCard text={data.compensationAlert} variant="warning" />
            )}
          </div>
        ) : (
          <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
            パターン未検出
          </div>
        )}
      </div>

      {/* ---- Section 3: 既往歴照合 ---- */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          既往歴照合
        </h4>
        {data.medicalHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">部位</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">傷病名</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">発症日</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">重症度</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">リスク倍率</th>
                </tr>
              </thead>
              <tbody>
                {data.medicalHistory.map((row, i) => {
                  const isHighRisk = row.riskMultiplier > 1.5;
                  return (
                    <tr
                      key={i}
                      className={`border-b border-border/50 last:border-0 ${isHighRisk ? 'bg-critical-500/5' : ''}`}
                    >
                      <td className="px-2 py-2 text-foreground">{row.bodyPart}</td>
                      <td className="px-2 py-2 text-foreground">{row.condition}</td>
                      <td className="px-2 py-2 text-muted-foreground">{row.date}</td>
                      <td className={`px-2 py-2 font-medium ${severityColor(row.severity)}`}>
                        {severityLabel(row.severity)}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums font-medium ${isHighRisk ? 'text-critical-500' : 'text-foreground'}`}>
                        {row.riskMultiplier.toFixed(1)}x
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
            既往歴データなし
          </div>
        )}
      </div>

      {/* ---- Section 4: ボディマップ ---- */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          ボディマップ
        </h4>
        {data.bodyMapTimeline.length > 0 ? (
          <div className="space-y-2">
            {data.bodyMapTimeline.map((entry, i) => (
              <div key={i} className="rounded-md border border-border/50 p-3 text-sm text-foreground">
                {JSON.stringify(entry)}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
            ボディマップデータは Daily Input から収集中
          </div>
        )}
      </div>
    </div>
  );
}
