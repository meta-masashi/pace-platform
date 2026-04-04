'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminHeader } from '@/components/admin/admin-header';
import { AdminDataTable } from '@/components/admin/admin-data-table';
import { AdminChart } from '@/components/admin/admin-chart';
import { AdminErrorState } from '@/components/admin/admin-error-state';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { AdminPageSkeleton } from '@/components/admin/admin-skeleton';
import { TimeRangeSelector } from '@/components/admin/time-range-selector';

// ---------------------------------------------------------------------------
// P6: 利用率
// ---------------------------------------------------------------------------

interface UsageRow extends Record<string, unknown> {
  org_name: string;
  dau: number;
  mau: number;
  checkin_rate: string;
  assessment_count: number;
  soap_count: number;
}

export default function UsagePage() {
  const [data, setData] = useState<{
    dauTrend: { label: string; value: number }[];
    mauTrend: { label: string; value: number }[];
    usageTable: UsageRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [, setTimeRange] = useState('30d');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      await new Promise((r) => setTimeout(r, 600));
      setData({
        dauTrend: [
          { label: '3/5', value: 120 }, { label: '3/10', value: 135 },
          { label: '3/15', value: 142 }, { label: '3/20', value: 138 },
          { label: '3/25', value: 155 }, { label: '3/30', value: 160 },
          { label: '4/4', value: 168 },
        ],
        mauTrend: [
          { label: '11月', value: 280 }, { label: '12月', value: 310 },
          { label: '1月', value: 340 }, { label: '2月', value: 365 },
          { label: '3月', value: 390 }, { label: '4月', value: 412 },
        ],
        usageTable: [
          { org_name: 'FC Tokyo', dau: 28, mau: 35, checkin_rate: '82%', assessment_count: 45, soap_count: 120 },
          { org_name: 'Cerezo Osaka', dau: 18, mau: 24, checkin_rate: '75%', assessment_count: 20, soap_count: 80 },
          { org_name: 'Vissel Kobe', dau: 32, mau: 40, checkin_rate: '88%', assessment_count: 55, soap_count: 150 },
          { org_name: 'Sanfrecce', dau: 40, mau: 52, checkin_rate: '90%', assessment_count: 68, soap_count: 200 },
          { org_name: 'Gamba Osaka', dau: 12, mau: 18, checkin_rate: '65%', assessment_count: 10, soap_count: 40 },
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
    { key: 'org_name', header: '組織名' },
    { key: 'dau', header: 'DAU' },
    { key: 'mau', header: 'MAU' },
    { key: 'checkin_rate', header: 'チェックイン率' },
    { key: 'assessment_count', header: 'アセスメント数' },
    { key: 'soap_count', header: 'SOAP数' },
  ];

  return (
    <div>
      <AdminHeader title="利用率">
        <TimeRangeSelector onChange={setTimeRange} options={['7d', '30d', '90d']} />
      </AdminHeader>

      <div className="space-y-6 p-6">
        {/* DAU/MAU チャート */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminChart data={data.dauTrend} title="DAU推移" yAxisLabel="ユーザー数" color="#3B82F6" />
          <AdminChart data={data.mauTrend} title="MAU推移" yAxisLabel="ユーザー数" color="#10B981" />
        </div>

        {/* チェックイン率テーブル */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">組織別利用状況</h2>
          <AdminDataTable columns={columns} data={data.usageTable} />
        </div>
      </div>
    </div>
  );
}
