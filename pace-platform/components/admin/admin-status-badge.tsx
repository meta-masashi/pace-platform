'use client';

// ---------------------------------------------------------------------------
// AdminStatusBadge — ステータスバッジ
// ---------------------------------------------------------------------------

interface AdminStatusBadgeProps {
  status: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

const VARIANT_MAP: Record<string, AdminStatusBadgeProps['variant']> = {
  active: 'success',
  paused: 'warning',
  cancelled: 'danger',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  paid: 'success',
  unpaid: 'danger',
  overdue: 'danger',
  healthy: 'success',
  degraded: 'warning',
  down: 'danger',
};

const LABEL_MAP: Record<string, string> = {
  active: 'アクティブ',
  paused: '休止中',
  cancelled: '解約',
  pending: '保留中',
  approved: '承認済み',
  rejected: '却下',
  paid: '支払い済み',
  unpaid: '未払い',
  overdue: '延滞',
  healthy: '正常',
  degraded: '低下',
  down: '停止',
};

const STYLE_MAP = {
  default: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-blue-50 text-blue-700',
} as const;

export function AdminStatusBadge({ status, variant }: AdminStatusBadgeProps) {
  const resolvedVariant = variant ?? VARIANT_MAP[status] ?? 'default';
  const label = LABEL_MAP[status] ?? status;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLE_MAP[resolvedVariant]}`}
    >
      {label}
    </span>
  );
}
