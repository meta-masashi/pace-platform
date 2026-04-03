import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlertItem {
  id: string;
  athleteId: string;
  athleteName: string;
  priority: 'critical' | 'watchlist';
  reason: string;
  /** URL to the athlete detail or action page */
  actionHref: string;
}

export interface RiskPreventionReport {
  id: string;
  athleteName: string;
  /** Description of the prevented risk */
  description: string;
  timestamp: string;
}

export interface ConditioningAlert {
  athleteId: string;
  athleteName: string;
  type: 'recovery_zone' | 'acwr_danger' | 'rapid_decline';
  conditioningScore?: number;
  acwr?: number;
  scoreDelta?: number;
}

interface AlertActionHubProps {
  alerts: AlertItem[];
  riskReports: RiskPreventionReport[];
  conditioningAlerts?: ConditioningAlert[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const priorityConfig = {
  critical: {
    dot: 'bg-critical-500',
    label: '緊急',
    order: 0,
  },
  watchlist: {
    dot: 'bg-watchlist-500',
    label: '注意',
    order: 1,
  },
} as const;

const conditioningAlertConfig = {
  recovery_zone: {
    label: 'リカバリーゾーン',
    icon: '\u26a0\ufe0f',
    reason: (a: ConditioningAlert) => `スコア ${a.conditioningScore} — 回復ゾーン（< 40）`,
    priority: 'critical' as const,
  },
  acwr_danger: {
    label: 'ACWR 危険',
    icon: '\u26a1',
    reason: (a: ConditioningAlert) =>
      `ACWR ${a.acwr?.toFixed(2)} — 安全ゾーン外（${(a.acwr ?? 0) > 1.5 ? '> 1.5' : '< 0.5'}）`,
    priority: 'critical' as const,
  },
  rapid_decline: {
    label: '急激低下',
    icon: '\u{1f4c9}',
    reason: (a: ConditioningAlert) => `3日間でスコア ${a.scoreDelta} 低下`,
    priority: 'watchlist' as const,
  },
} as const;

export function AlertActionHub({ alerts, riskReports, conditioningAlerts = [] }: AlertActionHubProps) {
  const sortedAlerts = [...alerts].sort(
    (a, b) => priorityConfig[a.priority].order - priorityConfig[b.priority].order,
  );

  return (
    <div className="space-y-4">
      {/* Today's Action */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">本日のアクション</h3>
        </div>

        {sortedAlerts.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            現在アラートはありません
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {sortedAlerts.map((alert) => {
              const config = priorityConfig[alert.priority];
              return (
                <li key={alert.id} className="flex items-center gap-3 px-5 py-3">
                  {/* Priority dot */}
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${config.dot}`}
                    title={config.label}
                  />

                  {/* Athlete name */}
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{alert.athleteName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {alert.reason}
                    </span>
                  </span>

                  {/* Action button */}
                  <Link
                    href={alert.actionHref}
                    className="shrink-0 rounded-md bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    対応する
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Conditioning-based Alerts (Sprint 7) */}
      {conditioningAlerts.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold">コンディショニングアラート</h3>
          </div>
          <ul className="divide-y divide-border">
            {conditioningAlerts.map((ca) => {
              const config = conditioningAlertConfig[ca.type];
              const pConfig = priorityConfig[config.priority];
              return (
                <li key={`${ca.athleteId}-${ca.type}`} className="flex items-center gap-3 px-5 py-3">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${pConfig.dot}`}
                    title={config.label}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium">
                      {config.icon} {ca.athleteName}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {config.reason(ca)}
                    </span>
                  </span>
                  <Link
                    href={`/athletes/${ca.athleteId}`}
                    className="shrink-0 rounded-md bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    確認する
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Risk Prevention Reports (AI Hard Lock) */}
      {riskReports.length > 0 && (
        <div className="space-y-2">
          {riskReports.map((report) => (
            <div
              key={report.id}
              className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3"
            >
              <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-blue-900">
                  重大リスクを未然に防ぎました
                </p>
                <p className="mt-0.5 text-xs text-blue-700">
                  {report.athleteName} &mdash; {report.description}
                </p>
                <p className="mt-1 text-xs text-blue-500">{report.timestamp}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline icon
// ---------------------------------------------------------------------------

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
