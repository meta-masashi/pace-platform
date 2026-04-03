interface KpiCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: {
    direction: 'up' | 'down' | 'flat';
    label: string;
  };
  color?: 'red' | 'amber' | 'green' | 'default';
  /** 7日間スパークラインデータ */
  sparklineData?: number[] | undefined;
  /** 前日比 (Day-over-Day delta) */
  dodDelta?: number | undefined;
  /** 前週比 (Week-over-Week delta) */
  wowDelta?: number | undefined;
}

const colorMap = {
  red: 'text-critical-500',
  amber: 'text-watchlist-500',
  green: 'text-optimal-500',
  default: 'text-foreground',
} as const;

const trendIconMap = {
  up: '\u2191',
  down: '\u2193',
  flat: '\u2192',
} as const;

const trendColorMap = {
  up: 'text-critical-500',
  down: 'text-optimal-500',
  flat: 'text-muted-foreground',
} as const;

/** 7点 SVG インラインスパークライン */
function Sparkline({ data, color }: { data: number[]; color: 'red' | 'amber' | 'green' | 'default' }) {
  if (data.length < 2) return null;

  const width = 80;
  const height = 24;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  const strokeColor = {
    red: '#ef4444',
    amber: '#f59e0b',
    green: '#10b981',
    default: '#6b7280',
  }[color];

  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** DoD / WoW デルタ表示 */
function DeltaBadge({ value, label }: { value: number; label: string }) {
  if (value === 0) return null;
  const isPositive = value > 0;
  const color = isPositive ? 'text-critical-500' : 'text-optimal-500';
  const arrow = isPositive ? '\u2191' : '\u2193';

  return (
    <span className={`text-[10px] font-medium ${color}`}>
      {arrow}{isPositive ? '+' : ''}{value} {label}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  subtext,
  trend,
  color = 'default',
  sparklineData,
  dodDelta,
  wowDelta,
}: KpiCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {sparklineData && sparklineData.length >= 2 && (
          <Sparkline data={sparklineData} color={color} />
        )}
      </div>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${colorMap[color]}`}>
        {value}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {subtext && (
          <span className="text-sm text-muted-foreground">{subtext}</span>
        )}
        {trend && (
          <span className={`text-xs font-medium ${trendColorMap[trend.direction]}`}>
            {trendIconMap[trend.direction]} {trend.label}
          </span>
        )}
      </div>
      {(dodDelta !== undefined || wowDelta !== undefined) && (
        <div className="mt-1.5 flex items-center gap-3">
          {dodDelta !== undefined && <DeltaBadge value={dodDelta} label="前日比" />}
          {wowDelta !== undefined && <DeltaBadge value={wowDelta} label="前週比" />}
        </div>
      )}
    </div>
  );
}
