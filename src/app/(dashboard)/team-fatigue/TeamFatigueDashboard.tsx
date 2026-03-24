'use client'

/**
 * TeamFatigueDashboard
 * S&C・AT向けのチーム疲労タイムライン（DBN予測集約）
 * Phase 4 Sprint 3（P4-20）
 */

import { useCallback, useEffect, useState } from 'react'
import { useSupabase } from '@/hooks/useSupabase'

interface HighRiskAthlete {
  id: string
  name: string
  state: string
  probability_high: number
}

interface DayEntry {
  high_count: number
  medium_count: number
  low_count: number
  athletes: Array<{ id: string; name: string; state: string; probability_high: number }>
}

interface PendingAlert {
  id: string
  athlete_name: string
  alert_date: string
  predicted_state: string
}

interface FatigueTimelineData {
  team_risk_score: number
  high_risk_athletes: HighRiskAthlete[]
  timeline: Record<string, DayEntry>
  pending_alerts: PendingAlert[]
}

const RISK_COLORS = {
  high: 'bg-red-500',
  medium: 'bg-yellow-400',
  low: 'bg-green-400',
} as const

function RiskBadge({ state }: { state: string }) {
  const label = state === 'high' ? '高リスク' : state === 'medium' ? '中リスク' : '低リスク'
  const color =
    state === 'high' ? 'bg-red-100 text-red-800 border-red-200' :
    state === 'medium' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
    'bg-green-100 text-green-800 border-green-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${color}`}>
      {label}
    </span>
  )
}

export default function TeamFatigueDashboard() {
  const { session } = useSupabase()
  const [data, setData] = useState<FatigueTimelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTimeline = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/team/fatigue-timeline')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const json = await res.json() as FatigueTimelineData
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    fetchTimeline()
  }, [fetchTimeline])

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <div key={i} className="h-24 bg-gray-200 rounded" />)}
          </div>
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={fetchTimeline} className="mt-2 text-red-600 text-sm underline">
            再試行
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const today = new Date().toISOString().slice(0, 10)
  const sortedDates = Object.keys(data.timeline).sort()

  const riskColor =
    data.team_risk_score >= 60 ? 'text-red-600' :
    data.team_risk_score >= 30 ? 'text-yellow-600' :
    'text-green-600'

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">チーム疲労タイムライン</h1>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">チームリスクスコア（今日）</p>
          <p className={`text-3xl font-bold mt-1 ${riskColor}`}>{data.team_risk_score}</p>
          <p className="text-xs text-gray-400 mt-1">0（低）〜 100（高）</p>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">高リスク選手数（今日）</p>
          <p className="text-3xl font-bold mt-1 text-red-600">{data.high_risk_athletes.length}</p>
          <p className="text-xs text-gray-400 mt-1">疲労確率 ≥ 50%</p>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">未対応アラート</p>
          <p className="text-3xl font-bold mt-1 text-orange-500">{data.pending_alerts.length}</p>
          <p className="text-xs text-gray-400 mt-1">要確認</p>
        </div>
      </div>

      {/* 高リスク選手リスト */}
      {data.high_risk_athletes.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-red-800 mb-3">
            本日の高リスク選手 TOP {data.high_risk_athletes.length}
          </h2>
          <div className="space-y-2">
            {data.high_risk_athletes.map((athlete) => (
              <div key={athlete.id} className="flex items-center justify-between bg-white rounded p-3 border border-red-100">
                <span className="font-medium text-gray-900">{athlete.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">
                    疲労確率: <span className="font-semibold text-red-600">{Math.round(athlete.probability_high * 100)}%</span>
                  </span>
                  <RiskBadge state={athlete.state} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* タイムライングラフ */}
      <div className="bg-white border rounded-lg p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">疲労予測タイムライン（過去14日 + 予測7日）</h2>
        <div className="overflow-x-auto">
          <div className="flex gap-1 min-w-max pb-2">
            {sortedDates.map((date) => {
              const day = data.timeline[date]
              const total = day.high_count + day.medium_count + day.low_count
              const isToday = date === today
              const isFuture = date > today
              return (
                <div key={date} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-10 rounded-t overflow-hidden flex flex-col-reverse ${isFuture ? 'opacity-60' : ''}`}
                    style={{ height: '80px' }}
                    title={`${date}: 高${day.high_count} 中${day.medium_count} 低${day.low_count}`}
                  >
                    {total > 0 ? (
                      <>
                        {day.low_count > 0 && (
                          <div
                            className={RISK_COLORS.low}
                            style={{ height: `${(day.low_count / total) * 80}px` }}
                          />
                        )}
                        {day.medium_count > 0 && (
                          <div
                            className={RISK_COLORS.medium}
                            style={{ height: `${(day.medium_count / total) * 80}px` }}
                          />
                        )}
                        {day.high_count > 0 && (
                          <div
                            className={RISK_COLORS.high}
                            style={{ height: `${(day.high_count / total) * 80}px` }}
                          />
                        )}
                      </>
                    ) : (
                      <div className="bg-gray-100 h-full" />
                    )}
                  </div>
                  <p className={`text-xs ${isToday ? 'font-bold text-blue-600' : 'text-gray-400'}`}>
                    {date.slice(5)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex gap-4 mt-3">
          {(['high', 'medium', 'low'] as const).map((state) => (
            <div key={state} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded-sm ${RISK_COLORS[state]}`} />
              <span className="text-xs text-gray-600">
                {state === 'high' ? '高リスク' : state === 'medium' ? '中リスク' : '低リスク'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 未対応アラート */}
      {data.pending_alerts.length > 0 && (
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">未対応の疲労アラート</h2>
          <div className="space-y-2">
            {data.pending_alerts.map((alert) => (
              <div key={alert.id} className="flex items-center justify-between p-3 bg-orange-50 border border-orange-100 rounded">
                <div>
                  <p className="font-medium text-gray-900">{alert.athlete_name}</p>
                  <p className="text-xs text-gray-500">{alert.alert_date}</p>
                </div>
                <RiskBadge state={alert.predicted_state} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
