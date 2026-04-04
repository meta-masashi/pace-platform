'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminHeader } from '@/components/admin/admin-header';
import { AdminDataTable } from '@/components/admin/admin-data-table';
import { AdminStatusBadge } from '@/components/admin/admin-status-badge';
import { AdminErrorState } from '@/components/admin/admin-error-state';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { AdminPageSkeleton } from '@/components/admin/admin-skeleton';

// ---------------------------------------------------------------------------
// P3: 契約チーム + プラン管理
// ---------------------------------------------------------------------------

interface TeamRow extends Record<string, unknown> {
  org_name: string;
  plan: string;
  staff_count: number;
  athlete_count: number;
  contract_date: string;
  status: string;
}

interface PlanChangeRequest extends Record<string, unknown> {
  org_name: string;
  current_plan: string;
  requested_plan: string;
  reason: string;
  status: string;
  created_at: string;
}

type TabId = 'teams' | 'pending' | 'approved' | 'rejected';

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [planChanges, setPlanChanges] = useState<PlanChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('teams');
  const [selectedTeam, setSelectedTeam] = useState<TeamRow | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      await new Promise((r) => setTimeout(r, 600));
      setTeams([
        { org_name: 'FC Tokyo', plan: 'Pro', staff_count: 8, athlete_count: 30, contract_date: '2025-10-01', status: 'active' },
        { org_name: 'Cerezo Osaka', plan: 'Standard', staff_count: 4, athlete_count: 25, contract_date: '2025-11-15', status: 'active' },
        { org_name: 'Vissel Kobe', plan: 'Pro + CV', staff_count: 12, athlete_count: 35, contract_date: '2025-09-01', status: 'active' },
        { org_name: 'Gamba Osaka', plan: 'Standard', staff_count: 3, athlete_count: 20, contract_date: '2026-01-01', status: 'paused' },
        { org_name: 'Sanfrecce', plan: 'Enterprise', staff_count: 15, athlete_count: 45, contract_date: '2025-08-01', status: 'active' },
      ]);
      setPlanChanges([
        { org_name: 'Cerezo Osaka', current_plan: 'Standard', requested_plan: 'Pro', reason: 'AI機能を使いたい', status: 'pending', created_at: '2026-04-02' },
        { org_name: 'Gamba Osaka', current_plan: 'Standard', requested_plan: 'Pro + CV', reason: 'CV解析が必要', status: 'approved', created_at: '2026-03-28' },
        { org_name: 'FC Tokyo', current_plan: 'Pro', requested_plan: 'Standard', reason: 'コスト削減', status: 'rejected', created_at: '2026-03-15' },
      ]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <AdminPageSkeleton />;
  if (error) return <div className="p-6"><AdminErrorState onRetry={fetchData} /></div>;

  const teamColumns = [
    { key: 'org_name', header: '組織名' },
    { key: 'plan', header: 'プラン' },
    { key: 'staff_count', header: 'スタッフ数' },
    { key: 'athlete_count', header: '選手数' },
    { key: 'contract_date', header: '契約日' },
    {
      key: 'status',
      header: 'ステータス',
      render: (row: TeamRow) => <AdminStatusBadge status={row.status} />,
    },
  ];

  const changeColumns = [
    { key: 'org_name', header: '組織名' },
    { key: 'current_plan', header: '現在のプラン' },
    { key: 'requested_plan', header: '変更先プラン' },
    { key: 'reason', header: '理由' },
    {
      key: 'status',
      header: 'ステータス',
      render: (row: PlanChangeRequest) => <AdminStatusBadge status={row.status} />,
    },
    { key: 'created_at', header: '申請日' },
  ];

  const tabs: { id: TabId; label: string }[] = [
    { id: 'teams', label: 'チーム一覧' },
    { id: 'pending', label: '保留中' },
    { id: 'approved', label: '承認済み' },
    { id: 'rejected', label: '却下' },
  ];

  const filteredChanges = activeTab === 'teams'
    ? []
    : planChanges.filter((r) => r.status === activeTab);

  return (
    <div>
      <AdminHeader title="契約チーム + プラン管理" />

      <div className="space-y-6 p-6">
        {/* タブ */}
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {tab.id !== 'teams' && (
                <span className="ml-1 text-xs text-slate-400">
                  ({planChanges.filter((r) => r.status === tab.id).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'teams' ? (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <AdminDataTable
                columns={teamColumns}
                data={teams}
                onRowClick={(row) => setSelectedTeam(row)}
              />
            </div>
            {/* 詳細パネル */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              {selectedTeam ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-900">{selectedTeam.org_name}</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">プラン</span><span className="font-medium">{selectedTeam.plan}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">スタッフ数</span><span className="font-medium">{selectedTeam.staff_count}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">選手数</span><span className="font-medium">{selectedTeam.athlete_count}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">契約日</span><span className="font-medium">{selectedTeam.contract_date}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">ステータス</span><AdminStatusBadge status={selectedTeam.status as string} /></div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-8">
                  チームを選択してください
                </p>
              )}
            </div>
          </div>
        ) : filteredChanges.length > 0 ? (
          <AdminDataTable columns={changeColumns} data={filteredChanges} />
        ) : (
          <AdminEmptyState description={`${tabs.find((t) => t.id === activeTab)?.label}のプラン変更依頼はありません。`} />
        )}
      </div>
    </div>
  );
}
