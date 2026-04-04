'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminHeader } from '@/components/admin/admin-header';
import { AdminKpiCard } from '@/components/admin/admin-kpi-card';
import { AdminDataTable } from '@/components/admin/admin-data-table';
import { AdminChart } from '@/components/admin/admin-chart';
import { AdminStatusBadge } from '@/components/admin/admin-status-badge';
import { AdminErrorState } from '@/components/admin/admin-error-state';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { AdminPageSkeleton } from '@/components/admin/admin-skeleton';
import { TimeRangeSelector } from '@/components/admin/time-range-selector';

// ---------------------------------------------------------------------------
// P2: 決済状況
// ---------------------------------------------------------------------------

function CreditCardIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function AlertIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function PercentIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

function TrendIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

interface BillingRow extends Record<string, unknown> {
  org_name: string;
  plan: string;
  latest_amount: string;
  status: string;
  next_billing: string;
}

export default function BillingPage() {
  const [data, setData] = useState<{
    kpis: { mrr: number; unpaid: number; collection: number; churn: number };
    billing: BillingRow[];
    mrrTrend: { label: string; value: number }[];
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
        kpis: { mrr: 7200000, unpaid: 3, collection: 96.5, churn: 2.1 },
        billing: [
          { org_name: 'FC Tokyo', plan: 'Pro', latest_amount: '\u00a5300,000', status: 'paid', next_billing: '2026-05-01' },
          { org_name: 'Cerezo Osaka', plan: 'Standard', latest_amount: '\u00a5100,000', status: 'paid', next_billing: '2026-05-01' },
          { org_name: 'Vissel Kobe', plan: 'Pro + CV', latest_amount: '\u00a5500,000', status: 'unpaid', next_billing: '2026-04-15' },
          { org_name: 'Sanfrecce', plan: 'Enterprise', latest_amount: '\u00a5600,000', status: 'paid', next_billing: '2026-05-01' },
          { org_name: 'Gamba Osaka', plan: 'Standard', latest_amount: '\u00a5100,000', status: 'overdue', next_billing: '2026-03-20' },
        ],
        mrrTrend: [
          { label: '11月', value: 5800000 },
          { label: '12月', value: 6100000 },
          { label: '1月', value: 6500000 },
          { label: '2月', value: 6800000 },
          { label: '3月', value: 7000000 },
          { label: '4月', value: 7200000 },
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
    { key: 'plan', header: 'プラン' },
    { key: 'latest_amount', header: '最新請求額' },
    {
      key: 'status',
      header: 'ステータス',
      render: (row: BillingRow) => <AdminStatusBadge status={row.status} />,
    },
    { key: 'next_billing', header: '次回請求日' },
  ];

  return (
    <div>
      <AdminHeader title="決済状況">
        <TimeRangeSelector onChange={setTimeRange} options={['7d', '30d', '90d']} />
      </AdminHeader>

      <div className="space-y-6 p-6">
        {/* KPIカード */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminKpiCard title="MRR" value={`\u00a5${(data.kpis.mrr / 1000000).toFixed(1)}M`} change={{ value: 8, direction: 'up' }} icon={CreditCardIcon} variant="success" />
          <AdminKpiCard title="未払い件数" value={data.kpis.unpaid} change={{ value: 1, direction: 'up' }} icon={AlertIcon} variant="danger" />
          <AdminKpiCard title="回収率" value={`${data.kpis.collection}%`} change={{ value: 0.5, direction: 'down' }} icon={PercentIcon} variant="default" />
          <AdminKpiCard title="解約率" value={`${data.kpis.churn}%`} change={{ value: 0.3, direction: 'up' }} icon={TrendIcon} variant="danger" />
        </div>

        {/* MRR推移チャート */}
        <AdminChart data={data.mrrTrend} title="MRR推移" yAxisLabel="金額" color="#10B981" />

        {/* 請求テーブル */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Stripe請求一覧</h2>
          <AdminDataTable columns={columns} data={data.billing} />
        </div>
      </div>
    </div>
  );
}
