'use client';

import { useState, useCallback } from 'react';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  is_leader: boolean;
  is_active: boolean;
  team_id: string | null;
  created_at: string;
  updated_at: string;
}

interface StaffTableProps {
  initialStaff: StaffMember[];
}

const ROLE_OPTIONS = [
  { value: 'master', label: 'Master' },
  { value: 'AT', label: 'AT' },
  { value: 'PT', label: 'PT' },
  { value: 'S&C', label: 'S&C' },
];

const ROLE_BADGE_COLORS: Record<string, string> = {
  master: 'bg-purple-100 text-purple-800',
  AT: 'bg-blue-100 text-blue-800',
  PT: 'bg-green-100 text-green-800',
  'S&C': 'bg-orange-100 text-orange-800',
};

export function StaffTable({ initialStaff }: StaffTableProps) {
  const [staffList, setStaffList] = useState<StaffMember[]>(initialStaff);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  const updateStaff = useCallback(
    async (staffId: string, updates: Record<string, unknown>) => {
      setUpdating(staffId);
      try {
        const res = await fetch('/api/admin/staff', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staffId, ...updates }),
        });
        const json = await res.json();
        if (json.success && json.data) {
          setStaffList((prev) =>
            prev.map((s) => (s.id === staffId ? { ...s, ...json.data } : s))
          );
        }
      } catch (err) {
        console.error('スタッフ更新エラー:', err);
      } finally {
        setUpdating(null);
      }
    },
    []
  );

  const filtered = staffList.filter((s) => {
    const matchSearch =
      search === '' ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === 'all' || s.role === filterRole;
    return matchSearch && matchRole;
  });

  return (
    <div className="space-y-4">
      {/* 検索・フィルターバー */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder="名前またはメールで検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">全ロール</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {/* テーブル */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">名前</th>
              <th className="px-4 py-3 text-left font-medium">メール</th>
              <th className="px-4 py-3 text-left font-medium">ロール</th>
              <th className="px-4 py-3 text-center font-medium">リーダー</th>
              <th className="px-4 py-3 text-center font-medium">ステータス</th>
              <th className="px-4 py-3 text-left font-medium">登録日</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  該当するスタッフが見つかりません
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr
                  key={s.id}
                  className={`border-b border-border transition-colors hover:bg-accent/30 ${
                    !s.is_active ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={s.role}
                      disabled={updating === s.id}
                      onChange={(e) => updateStaff(s.id, { role: e.target.value })}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        ROLE_BADGE_COLORS[s.role] ?? 'bg-gray-100 text-gray-800'
                      } border-none focus:outline-none focus:ring-1 focus:ring-primary`}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      disabled={updating === s.id}
                      onClick={() => updateStaff(s.id, { is_leader: !s.is_leader })}
                      className={`inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                        s.is_leader ? 'bg-primary' : 'bg-gray-300'
                      }`}
                      title={s.is_leader ? 'リーダーを解除' : 'リーダーに設定'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          s.is_leader ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      disabled={updating === s.id}
                      onClick={() => updateStaff(s.id, { is_active: !s.is_active })}
                      className={`inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                        s.is_active ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                      title={s.is_active ? '無効化' : '有効化'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          s.is_active ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString('ja-JP')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        全 {staffList.length} 名 / 表示中 {filtered.length} 名
      </p>
    </div>
  );
}
