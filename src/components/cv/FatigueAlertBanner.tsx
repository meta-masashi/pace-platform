'use client'

/**
 * FatigueAlertBanner Component
 * DBN 高疲労アラートをダッシュボードのバナーで表示 (ADR-014)
 * AT/PT が確認/却下できるインライン UI
 */

import { useCallback, useEffect, useState } from 'react'
import { useSupabase } from '@/hooks/useSupabase'

interface FatigueAlert {
  id: string
  athlete_id: string
  athlete_name: string
  alert_date: string
  predicted_fatigue_state: string
  confidence_score: number
  recommended_action: string
  alert_status: string
}

interface FatigueAlertBannerProps {
  teamId: string
  className?: string
}

export function FatigueAlertBanner({ teamId, className = '' }: FatigueAlertBannerProps) {
  const [alerts, setAlerts] = useState<FatigueAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const { session } = useSupabase()

  const fetchAlerts = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const resp = await fetch('/api/cv/fatigue-alert', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!resp.ok) return
      const data = await resp.json()
      setAlerts(data.alerts ?? [])
    } catch {
      // non-fatal
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  const handleAction = useCallback(
    async (alertId: string, action: 'acknowledged' | 'dismissed') => {
      if (!session?.access_token) return
      setDismissed((prev) => new Set([...prev, alertId]))
      await fetch('/api/cv/fatigue-alert', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ alert_id: alertId, action }),
      })
      setAlerts((prev) => prev.filter((a) => a.id !== alertId))
    },
    [session],
  )

  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.id))

  if (loading || visibleAlerts.length === 0) return null

  return (
    <div className={['space-y-2', className].join(' ')}>
      {visibleAlerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-start justify-between gap-4 bg-red-50 border border-red-200 rounded-xl px-5 py-4"
        >
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-2xl flex-shrink-0">🔴</span>
            <div className="min-w-0">
              <p className="font-semibold text-red-800 truncate">
                高疲労リスク: {alert.athlete_name}
              </p>
              <p className="text-sm text-red-600 mt-0.5">
                {new Date(alert.alert_date).toLocaleDateString('ja-JP')} 予測 —
                信頼度 {(alert.confidence_score * 100).toFixed(0)}%
              </p>
              <p className="text-sm text-red-700 mt-1">{alert.recommended_action}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => handleAction(alert.id, 'acknowledged')}
              className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
            >
              確認済み
            </button>
            <button
              onClick={() => handleAction(alert.id, 'dismissed')}
              className="text-xs px-3 py-1.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
            >
              却下
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
