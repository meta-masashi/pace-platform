'use client';

/**
 * 回復カーブチャート描画コンポーネント（Recharts 直接使用）
 *
 * rts-prediction-chart.tsx から dynamic import（SSR無効）で読み込まれる。
 * Recharts のコンポーネントを直接インポートして描画する。
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
} from 'recharts';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface CurveDataPoint {
  date: string;
  predictedProgress: number;
  actualProgress?: number;
  phase: number;
}

interface RecoveryCurveChartProps {
  /** 回復カーブデータ */
  curve: CurveDataPoint[];
  /** 現在日の文字列（YYYY-MM-DD） */
  todayStr: string;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * 回復カーブチャート
 *
 * シグモイド予測カーブ・実績データ・マイルストーンを Recharts で描画する。
 */
export function RecoveryCurveChart({ curve, todayStr }: RecoveryCurveChartProps) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={curve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => {
              const d = new Date(v);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            labelFormatter={(label: any) => {
              const d = new Date(String(label));
              return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
            }}
            formatter={(value: any, name: any) => {
              const label = name === 'predictedProgress' ? '予測進捗' : '実績';
              return [`${Number(value).toFixed(1)}%`, label] as [string, string];
            }}
          />
          {/* 予測カーブ */}
          <Area
            type="monotone"
            dataKey="predictedProgress"
            stroke="#10b981"
            fill="url(#emeraldGradient)"
            strokeWidth={2}
            name="predictedProgress"
          />
          {/* 実績データ */}
          <Scatter
            dataKey="actualProgress"
            fill="#059669"
            name="actualProgress"
          />
          {/* 現在位置 */}
          <ReferenceLine
            x={todayStr}
            stroke="#6366f1"
            strokeDasharray="4 4"
            label={{ value: '現在', position: 'top', fontSize: 11, fill: '#6366f1' }}
          />
          {/* 90% スレッショルド */}
          <ReferenceLine
            y={90}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{
              value: '合流可能ライン (90%)',
              position: 'insideTopRight',
              fontSize: 10,
              fill: '#f59e0b',
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
