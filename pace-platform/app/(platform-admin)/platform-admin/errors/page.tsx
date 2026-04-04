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
// P4: システムエラー
// ---------------------------------------------------------------------------

interface ErrorRow extends Record<string, unknown> {
  timestamp: string;
  status: number;
  path: string;
  message: string;
  count: number;
}

export default function ErrorsPage() {
  const [data, setData] = useState<{
    errorRate: { label: string; value: number }[];
    errors: ErrorRow[];
    engineStatus: { go: string; ts: string };
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
        errorRate: [
          { label: '00:00', value: 0.5 },
          { label: '04:00', value: 0.3 },
          { label: '08:00', value: 1.2 },
          { label: '12:00', value: 2.1 },
          { label: '16:00', value: 0.8 },
          { label: '20:00', value: 0.4 },
          { label: '24:00', value: 0.6 },
        ],
        errors: [
          { timestamp: '2026-04-04 14:32', status: 500, path: '/api/infer', message: 'Internal Server Error', count: 3 },
          { timestamp: '2026-04-04 12:15', status: 429, path: '/api/ai/daily-coach', message: 'Rate Limit Exceeded', count: 12 },
          { timestamp: '2026-04-04 09:45', status: 500, path: '/api/checkin', message: 'Database Connection Error', count: 1 },
          { timestamp: '2026-04-03 22:10', status: 502, path: '/api/cv/analyze', message: 'Bad Gateway', count: 2 },
          { timestamp: '2026-04-03 18:30', status: 500, path: '/api/assessment', message: 'Timeout', count: 5 },
        ],
        engineStatus: { go: 'healthy', ts: 'healthy' },
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
    { key: 'timestamp', header: '発生時刻' },
    {
      key: 'status',
      header: 'ステータス',
      render: (row: ErrorRow) => (
        <span className={`rounded px-1.5 py-0.5 font-mono text-xs font-medium ${
          row.status >= 500 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
        }`}>
          {row.status}
        </span>
      ),
    },
    { key: 'path', header: 'パス', render: (row: ErrorRow) => <span className="font-mono text-xs">{row.path}</span> },
    { key: 'message', header: 'メッセージ' },
    { key: 'count', header: '発生回数' },
  ];

  return (
    <div>
      <AdminHeader title="システムエラー">
        <TimeRangeSelector onChange={setTimeRange} options={['1h', '24h', '7d']} />
      </AdminHeader>

      <div className="space-y-6 p-6">
        {/* エンジン稼働ステータス */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Go エンジン</p>
              <p className="text-sm font-semibold text-slate-900">bayesian-engine-go</p>
            </div>
            <AdminStatusBadge status={data.engineStatus.go} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <p className="text-xs font-medium text-slate-500">TS エンジン</p>
              <p className="text-sm font-semibold text-slate-900">bayesian-engine-ts</p>
            </div>
            <AdminStatusBadge status={data.engineStatus.ts} />
          </div>
        </div>

        {/* APIエラー率推移チャート */}
        <AdminChart
          data={data.errorRate}
          title="APIエラー率推移"
          yAxisLabel="エラー率 (%)"
          color="#EF4444"
        />

        {/* エラー一覧 */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">エラー一覧</h2>
          <AdminDataTable columns={columns} data={data.errors} />
        </div>
      </div>
    </div>
  );
}
