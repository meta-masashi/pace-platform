'use client';

// ---------------------------------------------------------------------------
// AdminChart — 時系列チャート（SVGベース軽量実装）
// ---------------------------------------------------------------------------
// Rechartsを使用可能な場合はラップ可能。ここでは依存を最小限にするためSVGで実装。

interface DataPoint {
  label: string;
  value: number;
}

interface AdminChartProps {
  data: DataPoint[];
  height?: number;
  color?: string;
  title?: string;
  yAxisLabel?: string;
  type?: 'line' | 'bar';
}

export function AdminChart({
  data,
  height = 200,
  color = '#3B82F6',
  title,
  yAxisLabel,
  type = 'line',
}: AdminChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-slate-200 bg-white text-sm text-slate-400"
        style={{ height }}
      >
        データがありません
      </div>
    );
  }

  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = 600;
  const chartHeight = height;
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = chartHeight - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map((d) => d.value));
  const minVal = Math.min(...data.map((d) => d.value), 0);
  const range = maxVal - minVal || 1;

  function scaleX(i: number) {
    return padding.left + (i / (data.length - 1 || 1)) * innerW;
  }

  function scaleY(v: number) {
    return padding.top + innerH - ((v - minVal) / range) * innerH;
  }

  // Y軸の目盛り
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) =>
    minVal + (range / (yTicks - 1)) * i
  );

  return (
    <div className="max-w-2xl rounded-lg border border-slate-200 bg-white p-4">
      {title && (
        <h3 className="mb-3 text-xs font-semibold text-slate-700">{title}</h3>
      )}
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* グリッド線 */}
        {yTickValues.map((v, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              y1={scaleY(v)}
              x2={chartWidth - padding.right}
              y2={scaleY(v)}
              stroke="#E2E8F0"
              strokeWidth="1"
              strokeDasharray="4,4"
            />
            <text
              x={padding.left - 8}
              y={scaleY(v) + 4}
              textAnchor="end"
              className="text-[10px] fill-slate-400"
            >
              {v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Y軸ラベル */}
        {yAxisLabel && (
          <text
            x={12}
            y={chartHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90, 12, ${chartHeight / 2})`}
            className="text-[10px] fill-slate-400"
          >
            {yAxisLabel}
          </text>
        )}

        {type === 'line' ? (
          <>
            {/* エリア */}
            <path
              d={`M${data.map((d, i) => `${scaleX(i)},${scaleY(d.value)}`).join(' L')} L${scaleX(data.length - 1)},${scaleY(minVal)} L${scaleX(0)},${scaleY(minVal)} Z`}
              fill={color}
              fillOpacity="0.08"
            />
            {/* ライン */}
            <polyline
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={data.map((d, i) => `${scaleX(i)},${scaleY(d.value)}`).join(' ')}
            />
            {/* ドット */}
            {data.map((d, i) => (
              <circle
                key={i}
                cx={scaleX(i)}
                cy={scaleY(d.value)}
                r="3"
                fill="white"
                stroke={color}
                strokeWidth="2"
              />
            ))}
          </>
        ) : (
          <>
            {/* バー */}
            {data.map((d, i) => {
              const barW = Math.max(innerW / data.length - 4, 8);
              const x = scaleX(i) - barW / 2;
              const y = scaleY(d.value);
              const h = scaleY(minVal) - y;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(h, 0)}
                  rx="2"
                  fill={color}
                  fillOpacity="0.8"
                />
              );
            })}
          </>
        )}

        {/* X軸ラベル */}
        {data.map((d, i) => {
          // ラベルが多い場合は間引き
          if (data.length > 12 && i % Math.ceil(data.length / 12) !== 0) return null;
          return (
            <text
              key={i}
              x={scaleX(i)}
              y={chartHeight - 8}
              textAnchor="middle"
              className="text-[10px] fill-slate-400"
            >
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
