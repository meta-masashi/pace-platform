'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminHeader } from '@/components/admin/admin-header';
import { AdminDataTable } from '@/components/admin/admin-data-table';
import { AdminChart } from '@/components/admin/admin-chart';
import { AdminStatusBadge } from '@/components/admin/admin-status-badge';
import { AdminErrorState } from '@/components/admin/admin-error-state';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { AdminPageSkeleton } from '@/components/admin/admin-skeleton';
import { TimeRangeSelector } from '@/components/admin/time-range-selector';

// ---------------------------------------------------------------------------
// P5: 推論エンジン監視
// ---------------------------------------------------------------------------

interface SwitchHistoryRow extends Record<string, unknown> {
  timestamp: string;
  from_engine: string;
  to_engine: string;
  reason: string;
  triggered_by: string;
}

export default function EnginePage() {
  const [data, setData] = useState<{
    activeEngine: string;
    latency: { p50: number; p95: number; p99: number };
    latencyTrend: { label: string; value: number }[];
    switchHistory: SwitchHistoryRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [, setTimeRange] = useState('24h');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      await new Promise((r) => setTimeout(r, 600));
      setData({
        activeEngine: 'TypeScript (bayesian-engine.ts)',
        latency: { p50: 45, p95: 120, p99: 250 },
        latencyTrend: [
          { label: '00:00', value: 42 },
          { label: '04:00', value: 38 },
          { label: '08:00', value: 55 },
          { label: '12:00', value: 68 },
          { label: '16:00', value: 52 },
          { label: '20:00', value: 45 },
        ],
        switchHistory: [
          { timestamp: '2026-04-01 09:00', from_engine: 'Go', to_engine: 'TS', reason: 'Shadow Mode差分検出', triggered_by: 'auto' },
          { timestamp: '2026-03-28 15:30', from_engine: 'TS', to_engine: 'Go', reason: 'パフォーマンステスト', triggered_by: 'manual' },
          { timestamp: '2026-03-25 08:00', from_engine: 'Go', to_engine: 'TS', reason: 'Go エンジンエラー', triggered_by: 'auto' },
        ],
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <AdminPageSkeleton />;
  if (error) return <div className="p-6"><AdminErrorState onRetry={fetchData} /></div>;
  if (!data) return <div className="p-6"><AdminEmptyState /></div>;

  const columns = [
    { key: 'timestamp', header: '切替日時' },
    { key: 'from_engine', header: '切替元' },
    { key: 'to_engine', header: '切替先' },
    { key: 'reason', header: '理由' },
    {
      key: 'triggered_by',
      header: 'トリガー',
      render: (row: SwitchHistoryRow) => (
        <AdminStatusBadge status={row.triggered_by} variant={row.triggered_by === 'auto' ? 'info' : 'default'} />
      ),
    },
  ];

  return (
    <div>
      <AdminHeader title="推論エンジン監視">
        <TimeRangeSelector onChange={setTimeRange} options={['1h', '24h', '7d']} />
      </AdminHeader>

      <div className="space-y-6 p-6">
        {/* アクティブエンジン表示 */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">アクティブエンジン</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{data.activeEngine}</p>
            </div>
            <AdminStatusBadge status="healthy" />
          </div>
        </div>

        {/* レイテンシ */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: 'p50', value: data.latency.p50 },
            { label: 'p95', value: data.latency.p95 },
            { label: 'p99', value: data.latency.p99 },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <p className="text-xs font-medium uppercase text-slate-500">{item.label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{item.value}ms</p>
            </div>
          ))}
        </div>

        {/* レイテンシチャート */}
        <AdminChart
          data={data.latencyTrend}
          title="レイテンシ推移 (p50)"
          yAxisLabel="ms"
          color="#3B82F6"
        />

        {/* 切替履歴 */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Go/TS切替履歴</h2>
          <AdminDataTable columns={columns} data={data.switchHistory} />
        </div>
      </div>
    </div>
  );
}
