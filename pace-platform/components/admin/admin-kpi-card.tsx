'use client';

import type { ComponentType, SVGProps } from 'react';

// ---------------------------------------------------------------------------
// AdminKpiCard — プラットフォーム管理画面用KPIカード
// ---------------------------------------------------------------------------

interface AdminKpiCardProps {
  title: string;
  value: string | number;
  change?: { value: number; direction: 'up' | 'down' };
  changeLabel?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  sparklineData?: number[];
}

function SparkLine({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const h = 32;
  const w = 80;
  const step = w / (data.length - 1);

  const points = data
    .map((v, i) => `${i * step},${h - ((v - min) / range) * h}`)
    .join(' ');

  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

const VARIANT_STYLES = {
  default: {
    iconBg: 'bg-blue-900/30',
    iconColor: 'text-blue-400',
    sparkColor: '#3B82F6',
  },
  success: {
    iconBg: 'bg-emerald-900/30',
    iconColor: 'text-emerald-400',
    sparkColor: '#10B981',
  },
  warning: {
    iconBg: 'bg-amber-900/30',
    iconColor: 'text-amber-400',
    sparkColor: '#F59E0B',
  },
  danger: {
    iconBg: 'bg-red-900/30',
    iconColor: 'text-red-400',
    sparkColor: '#EF4444',
  },
} as const;

export function AdminKpiCard({
  title,
  value,
  change,
  changeLabel = '前月比',
  icon: Icon,
  variant = 'default',
  sparklineData,
}: AdminKpiCardProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${styles.iconBg}`}>
              <Icon className={`h-4 w-4 ${styles.iconColor}`} />
            </div>
            <span className="text-xs font-medium text-slate-500">{title}</span>
          </div>

          <p className="text-2xl font-bold text-slate-900">{value}</p>

          {change && (
            <div className="flex items-center gap-1">
              <span
                className={`text-xs font-medium ${
                  change.direction === 'up'
                    ? variant === 'danger'
                      ? 'text-red-600'
                      : 'text-emerald-600'
                    : variant === 'danger'
                      ? 'text-emerald-600'
                      : 'text-red-600'
                }`}
              >
                {change.direction === 'up' ? '+' : '-'}
                {Math.abs(change.value)}
                {typeof change.value === 'number' && change.value < 100 ? '%' : ''}
              </span>
              <span className="text-xs text-slate-400">{changeLabel}</span>
            </div>
          )}
        </div>

        {sparklineData && sparklineData.length > 1 && (
          <div className="mt-2">
            <SparkLine data={sparklineData} color={styles.sparkColor} />
          </div>
        )}
      </div>
    </div>
  );
}
