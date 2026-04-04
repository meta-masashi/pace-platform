'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AdminHeader } from '@/components/admin/admin-header';
import { AdminKpiCard } from '@/components/admin/admin-kpi-card';
import { AdminChart } from '@/components/admin/admin-chart';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { AdminErrorState } from '@/components/admin/admin-error-state';
import { AdminPageSkeleton } from '@/components/admin/admin-skeleton';

// ---------------------------------------------------------------------------
// P1: プラットフォーム管理ダッシュボード
// ---------------------------------------------------------------------------

// アイコンコンポーネント
function BuildingIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
    </svg>
  );
}

function DollarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
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

function BugIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

interface DashboardData {
  teams: { count: number; change: number; sparkline: number[] };
  mrr: { value: number; change: number; sparkline: number[] };
  unpaid: { count: number };
  errors: { count: number; change: number; sparkline: number[] };
  usage: { rate: number; change: number; sparkline: number[] };
  recentUnpaid: { name: string; amount: string; days: number }[];
  recentErrors: { status: number; path: string; ago: string }[];
  mrrTrend: { label: string; value: number }[];
}

export default function PlatformAdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // モックデータ（API接続まではプレースホルダー）
      await new Promise((r) => setTimeout(r, 800));
      setData({
        teams: { count: 24, change: 2, sparkline: [18, 19, 20, 21, 22, 24] },
        mrr: { value: 7200000, change: 8, sparkline: [5800000, 6100000, 6500000, 6800000, 7000000, 7200000] },
        unpaid: { count: 3 },
        errors: { count: 12, change: -5, sparkline: [25, 20, 18, 15, 14, 12] },
        usage: { rate: 78, change: 3, sparkline: [68, 70, 72, 74, 76, 78] },
        recentUnpaid: [
          { name: 'Team Alpha', amount: '\u00a5300,000', days: 15 },
          { name: 'Team Beta', amount: '\u00a5100,000', days: 7 },
          { name: 'Team Gamma', amount: '\u00a5500,000', days: 30 },
        ],
        recentErrors: [
          { status: 500, path: '/api/infer', ago: '2時間前' },
          { status: 429, path: '/api/ai/daily-coach', ago: '5時間前' },
          { status: 500, path: '/api/checkin', ago: '1日前' },
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
  if (!data) return <div className="p-6"><AdminEmptyState description="チームが契約するとダッシュボードにデータが表示されます。" /></div>;

  return (
    <div>
      <AdminHeader title="ダッシュボード" />

      <div className="space-y-6 p-6">
        {/* KPIカード */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <AdminKpiCard
            title="契約チーム数"
            value={data.teams.count}
            change={{ value: data.teams.change, direction: 'up' }}
            icon={BuildingIcon}
            variant="default"
            sparklineData={data.teams.sparkline}
          />
          <AdminKpiCard
            title="MRR"
            value={`\u00a5${(data.mrr.value / 1000000).toFixed(1)}M`}
            change={{ value: data.mrr.change, direction: 'up' }}
            icon={DollarIcon}
            variant="success"
            sparklineData={data.mrr.sparkline}
          />
          <AdminKpiCard
            title="未払いアラート"
            value={data.unpaid.count}
            icon={AlertIcon}
            variant="danger"
          />
          <AdminKpiCard
            title="エラー件数"
            value={data.errors.count}
            change={{ value: Math.abs(data.errors.change), direction: 'down' }}
            icon={BugIcon}
            variant="warning"
            sparklineData={data.errors.sparkline}
          />
          <AdminKpiCard
            title="全体利用率"
            value={`${data.usage.rate}%`}
            change={{ value: data.usage.change, direction: 'up' }}
            icon={UsersIcon}
            variant="default"
            sparklineData={data.usage.sparkline}
          />
        </div>

        {/* クイックアクション行 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 未払いアラート */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">未払いアラート（直近）</h3>
            <div className="space-y-2">
              {data.recentUnpaid.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{item.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-slate-900">{item.amount}</span>
                    <span className="text-xs text-red-500">{item.days}日超過</span>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/platform-admin/billing"
              className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              決済状況を見る &rarr;
            </Link>
          </div>

          {/* 最近のエラー */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">最近のエラー（直近5件）</h3>
            <div className="space-y-2">
              {data.recentErrors.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-mono font-medium ${
                      item.status >= 500 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      {item.status}
                    </span>
                    <span className="font-mono text-slate-600">{item.path}</span>
                  </div>
                  <span className="text-xs text-slate-400">{item.ago}</span>
                </div>
              ))}
            </div>
            <Link
              href="/platform-admin/errors"
              className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              エラー一覧を見る &rarr;
            </Link>
          </div>
        </div>

        {/* MRR推移チャート */}
        <AdminChart
          data={data.mrrTrend}
          title="MRR推移（直近6ヶ月）"
          yAxisLabel="金額"
          color="#10B981"
        />
      </div>
    </div>
  );
}
