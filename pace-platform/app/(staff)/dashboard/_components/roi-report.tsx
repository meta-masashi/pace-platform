"use client";

/**
 * ROI レポートカード — ファクトベースの ROI 指標 4枚を横並び表示
 *
 * inference_trace_logs から算出した事実ベースの指標:
 * - P2 リスク検出数
 * - 負荷調整実施数
 * - 推定回避日数
 * - Critical 解決率
 */

import { useEffect, useState } from "react";

interface RoiData {
  month: string;
  p2DetectionCount: number;
  loadAdjustmentAssist: number;
  estimatedDaysAvoided: number;
  criticalResolutionRate: number;
}

interface RoiReportProps {
  teamId: string;
}

function RoiKpiCard({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string | number;
  unit: string;
  color: string;
}) {
  return (
    <div className="flex flex-1 flex-col rounded-lg border border-border bg-card p-4">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

export function RoiReport({ teamId }: RoiReportProps) {
  const [data, setData] = useState<RoiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;

    let cancelled = false;

    async function fetchRoi() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/team/roi-report?team_id=${encodeURIComponent(teamId)}`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled && json.success) {
          setData(json.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "ROI データの取得に失敗しました");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchRoi();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-700">
          {error ?? "ROI レポートデータがありません"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">ROI レポート</h3>
        <span className="text-xs text-muted-foreground">{data.month}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <RoiKpiCard
          label="P2 リスク検出"
          value={data.p2DetectionCount}
          unit="件/月"
          color="text-amber-600"
        />
        <RoiKpiCard
          label="負荷調整実施"
          value={data.loadAdjustmentAssist}
          unit="件/月"
          color="text-emerald-600"
        />
        <RoiKpiCard
          label="推定回避日数"
          value={data.estimatedDaysAvoided}
          unit="日/月"
          color="text-blue-600"
        />
        <RoiKpiCard
          label="Critical 解決率"
          value={`${data.criticalResolutionRate}%`}
          unit="72h 以内"
          color="text-emerald-600"
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        ※ 推定回避日数 = 負荷調整実施 × 14日(平均離脱期間) × 0.6(寄与率)
      </p>
    </div>
  );
}
