'use client'

/**
 * EnterpriseDashboard
 * Enterprise Admin 向けの多チーム管理ダッシュボード
 * Phase 4 Sprint 2（P4-11）
 */

import { useCallback, useEffect, useState } from 'react'
import { useSupabase } from '@/hooks/useSupabase'

interface ChildOrganization {
  id: string
  name: string
  plan: string
  athlete_limit: number
  cv_addon_enabled: boolean
  created_at: string
  team_count: number
  athlete_count: number
  is_parent: boolean
}

interface EnterpriseSummary {
  organizations: ChildOrganization[]
}

export default function EnterpriseDashboard() {
  const { session } = useSupabase()
  const [summary, setSummary] = useState<EnterpriseSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newAthleteLimit, setNewAthleteLimit] = useState(30)
  const [creating, setCreating] = useState(false)

  const fetchSummary = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/enterprise/teams')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (res.status === 403) {
          throw new Error('この機能は Enterprise Admin のみ利用可能です')
        }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setSummary(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/enterprise/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOrgName.trim(), athlete_limit: newAthleteLimit }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setNewOrgName('')
      setNewAthleteLimit(30)
      setShowAddForm(false)
      await fetchSummary()
    } catch (e) {
      alert(e instanceof Error ? e.message : '作成に失敗しました')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 bg-gray-200 rounded" />)}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    )
  }

  const orgs = summary?.organizations ?? []
  const totalAthletes = orgs.reduce((sum, o) => sum + o.athlete_count, 0)
  const totalTeams = orgs.reduce((sum, o) => sum + o.team_count, 0)
  const childOrgs = orgs.filter((o) => !o.is_parent)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Enterprise 管理ダッシュボード</h1>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + チームを追加
        </button>
      </div>

      {/* KPI サマリ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: '管理チーム数', value: orgs.length, unit: '組織' },
          { label: '傘下チーム数', value: childOrgs.length, unit: 'チーム' },
          { label: '総選手数', value: totalAthletes, unit: '名' },
          { label: '総チーム数', value: totalTeams, unit: 'チーム' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border rounded-lg p-4 shadow-sm">
            <p className="text-xs text-gray-500">{kpi.label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{kpi.value}</p>
            <p className="text-xs text-gray-400">{kpi.unit}</p>
          </div>
        ))}
      </div>

      {/* 新規チーム追加フォーム */}
      {showAddForm && (
        <div className="bg-white border border-indigo-100 rounded-lg p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">新規チーム追加</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">チーム名</label>
              <input
                type="text"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="例: FC 東京 U-23"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateOrg()}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">選手上限</label>
              <input
                type="number"
                value={newAthleteLimit}
                onChange={(e) => setNewAthleteLimit(parseInt(e.target.value, 10))}
                min={1}
                max={200}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleCreateOrg}
              disabled={creating || !newOrgName.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {creating ? '作成中...' : '作成'}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border text-sm rounded hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* 組織一覧 */}
      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {['組織名', 'プラン', '選手数 / 上限', 'チーム数', 'CV解析', '追加日'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orgs.map((org) => (
              <tr key={org.id} className={org.is_parent ? 'bg-indigo-50' : 'bg-white hover:bg-gray-50'}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{org.name}</span>
                    {org.is_parent && (
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">親組織</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    org.plan === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                    org.plan === 'pro' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {org.plan.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {org.athlete_count} / {org.athlete_limit}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{org.team_count}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    org.cv_addon_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {org.cv_addon_enabled ? '有効' : '無効'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {new Date(org.created_at).toLocaleDateString('ja-JP')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
