'use client';

/**
 * チーム負荷サマリーコンポーネント
 *
 * チーム全体の ACWR 平均、Monotony 平均、負荷集中度を表示。
 * ダッシュボード上部に配置し、チーム全体のリスク傾向を俯瞰する。
 */

interface TeamLoadSummaryProps {
  avgAcwr: number;
  avgMonotony: number;
  /** 上位N名の負荷集中データ: { name, percent } */
  loadConcentration: { name: string; percent: number }[];
  /** チーム全体の負荷集中度（上位3名の合計%） */
  concentrationTotal: number;
  /** ACWR閾値（競技別） */
  acwrThreshold?: number;
  /** Monotony閾値（競技別） */
  monotonyThreshold?: number;
}

export function TeamLoadSummary({
  avgAcwr,
  avgMonotony,
  loadConcentration,
  concentrationTotal,
  acwrThreshold = 1.5,
  monotonyThreshold = 2.0,
}: TeamLoadSummaryProps) {
  const acwrPercent = Math.min((avgAcwr / acwrThreshold) * 100, 100);
  const monotonyPercent = Math.min((avgMonotony / monotonyThreshold) * 100, 100);

  const acwrColor = avgAcwr > acwrThreshold ? 'text-critical-500' : avgAcwr > acwrThreshold * 0.85 ? 'text-watchlist-500' : 'text-optimal-500';
  const monotonyColor = avgMonotony > monotonyThreshold ? 'text-critical-500' : avgMonotony > monotonyThreshold * 0.85 ? 'text-watchlist-500' : 'text-optimal-500';

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        チーム負荷サマリー
      </h3>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {/* ACWR 平均 */}
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">平均 ACWR</span>
            <span className={`text-xl font-bold tabular-nums ${acwrColor}`}>
              {avgAcwr.toFixed(2)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                avgAcwr > acwrThreshold ? 'bg-critical-500' : avgAcwr > acwrThreshold * 0.85 ? 'bg-watchlist-500' : 'bg-optimal-500'
              }`}
              style={{ width: `${acwrPercent}%` }}
            />
          </div>
          <p className="mt-1 text-2xs text-muted-foreground">
            適正域: 0.8 - {acwrThreshold.toFixed(1)}
          </p>
        </div>

        {/* Monotony 平均 */}
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">平均 Monotony</span>
            <span className={`text-xl font-bold tabular-nums ${monotonyColor}`}>
              {avgMonotony.toFixed(2)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                avgMonotony > monotonyThreshold ? 'bg-critical-500' : avgMonotony > monotonyThreshold * 0.85 ? 'bg-watchlist-500' : 'bg-optimal-500'
              }`}
              style={{ width: `${monotonyPercent}%` }}
            />
          </div>
          <p className="mt-1 text-2xs text-muted-foreground">
            適正域: &lt; {monotonyThreshold.toFixed(1)}
          </p>
        </div>

        {/* 負荷集中度 */}
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">負荷集中度</span>
            <span className={`text-xl font-bold tabular-nums ${
              concentrationTotal > 50 ? 'text-critical-500' : concentrationTotal > 35 ? 'text-watchlist-500' : 'text-optimal-500'
            }`}>
              {concentrationTotal}%
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {loadConcentration.slice(0, 3).map((athlete) => (
              <div key={athlete.name} className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-cyber-cyan-500/60"
                    style={{ width: `${Math.min(athlete.percent * 3, 100)}%` }}
                  />
                </div>
                <span className="w-20 truncate text-2xs text-muted-foreground">
                  {athlete.name}
                </span>
                <span className="w-8 text-right text-2xs font-medium tabular-nums text-foreground">
                  {athlete.percent}%
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-2xs text-muted-foreground">
            上位3名の sRPE 占有率
          </p>
        </div>
      </div>
    </div>
  );
}
