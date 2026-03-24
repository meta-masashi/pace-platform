interface KpiCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: {
    direction: 'up' | 'down' | 'flat';
    label: string;
  };
  color?: 'red' | 'amber' | 'green' | 'default';
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

export function KpiCard({ label, value, subtext, trend, color = 'default' }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${colorMap[color]}`}>
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {subtext && (
          <span className="text-sm text-muted-foreground">{subtext}</span>
        )}
        {trend && (
          <span className={`text-xs font-medium ${trendColorMap[trend.direction]}`}>
            {trendIconMap[trend.direction]} {trend.label}
          </span>
        )}
      </div>
    </div>
  );
}
