'use client';

/**
 * PACE Platform — カレンダーオーバーレイチャート
 *
 * Google Calendar のイベントと負荷予測を複合チャートで可視化する。
 * - 棒グラフ: イベント種別（試合=赤、高強度=アンバー、回復=緑、その他=グレー）
 * - 折れ線グラフ: 予測プレー可能率（%）
 * - 基準線: 現在のプレー可能率
 */

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { LoadPrediction, EventType } from '@/lib/calendar/types';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface CalendarOverlayChartProps {
  predictions: LoadPrediction[];
  currentAvailability: number;
}

interface ChartDataPoint {
  date: string;
  eventName: string;
  eventType: EventType;
  eventTypeValue: number;
  predictedAvailability: number;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** イベント種別ごとの棒グラフの高さ（表示用の相対値） */
const EVENT_TYPE_HEIGHT: Readonly<Record<EventType, number>> = {
  match: 100,
  high_intensity: 70,
  recovery: 40,
  other: 20,
} as const;

/** イベント種別ごとの色 */
const EVENT_TYPE_COLOR: Readonly<Record<EventType, string>> = {
  match: '#ef4444',
  high_intensity: '#f59e0b',
  recovery: '#10b981',
  other: '#9ca3af',
} as const;

/** イベント種別の日本語ラベル */
const EVENT_TYPE_LABEL: Readonly<Record<EventType, string>> = {
  match: '試合',
  high_intensity: '高強度',
  recovery: '回復',
  other: 'その他',
} as const;

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function CalendarOverlayChart({
  predictions,
  currentAvailability,
}: CalendarOverlayChartProps) {
  if (predictions.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        カレンダーイベントのデータがありません
      </div>
    );
  }

  // チャートデータに変換
  const chartData: ChartDataPoint[] = predictions.map((p) => ({
    date: p.date.slice(5), // "MM-DD"
    eventName: p.eventName,
    eventType: p.eventType,
    eventTypeValue: EVENT_TYPE_HEIGHT[p.eventType],
    predictedAvailability: p.predictedAvailability,
  }));

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold">
        スケジュール負荷予測（今後 30 日間）
      </h3>

      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        {(Object.entries(EVENT_TYPE_LABEL) as [EventType, string][]).map(
          ([type, label]) => (
            <span key={type} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: EVENT_TYPE_COLOR[type] }}
              />
              {label}
            </span>
          ),
        )}
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-blue-500" />
          予測可能率
        </span>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={chartData}
          margin={{ top: 10, right: 20, bottom: 5, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(160 15% 90%)"
            vertical={false}
          />

          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'hsl(160 5% 45%)' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />

          {/* 左軸: イベント種別（非表示ラベル） */}
          <YAxis
            yAxisId="event"
            orientation="left"
            domain={[0, 120]}
            hide
          />

          {/* 右軸: プレー可能率（%） */}
          <YAxis
            yAxisId="availability"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: 'hsl(160 5% 45%)' }}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(v: number) => `${v}%`}
          />

          {/* 現在のプレー可能率の基準線 */}
          <ReferenceLine
            yAxisId="availability"
            y={currentAvailability}
            stroke="#3b82f6"
            strokeDasharray="6 4"
            strokeWidth={1.5}
            label={{
              value: `現在 ${currentAvailability}%`,
              position: 'insideTopRight',
              fill: '#3b82f6',
              fontSize: 10,
            }}
          />

          <Tooltip content={<CalendarTooltip />} />

          <Legend
            wrapperStyle={{ display: 'none' }}
          />

          {/* イベント種別の棒グラフ */}
          <Bar
            yAxisId="event"
            dataKey="eventTypeValue"
            name="イベント"
            barSize={16}
            radius={[2, 2, 0, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={EVENT_TYPE_COLOR[entry.eventType]}
                fillOpacity={0.7}
              />
            ))}
          </Bar>

          {/* 予測プレー可能率の折れ線 */}
          <Line
            yAxisId="availability"
            type="monotone"
            dataKey="predictedAvailability"
            name="予測可能率"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3, fill: '#3b82f6' }}
            activeDot={{ r: 5, fill: '#3b82f6' }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// カスタムツールチップ
// ---------------------------------------------------------------------------

interface TooltipPayloadEntry {
  name: string;
  value: number;
  payload: ChartDataPoint;
}

interface CalendarTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function CalendarTooltip({ active, payload, label }: CalendarTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]!.payload;

  return (
    <div className="rounded-md border border-border bg-white p-3 shadow-sm">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{data.eventName}</p>
      <p className="mt-1 text-xs">
        種別:{' '}
        <span style={{ color: EVENT_TYPE_COLOR[data.eventType] }}>
          {EVENT_TYPE_LABEL[data.eventType]}
        </span>
      </p>
      <p className="text-xs">
        予測可能率:{' '}
        <span className="font-medium text-blue-600">
          {data.predictedAvailability}%
        </span>
      </p>
    </div>
  );
}
