/**
 * PATCH /api/cv/fatigue-alert
 * 疲労アラートのステータス更新 (acknowledged / dismissed)
 * AT/PT がダッシュボードで確認/却下したことを記録
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface AcknowledgeRequest {
  alert_id: string
  action: 'acknowledged' | 'dismissed'
  note?: string
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: staffRow } = await supabase
    .from('team_staff').select('team_id').eq('user_id', user.id).single()
  if (!staffRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get pending high fatigue alerts for team's athletes
  const { data: alerts, error } = await supabase
    .from('v_active_fatigue_alerts')
    .select('*')
    .eq('team_id', staffRow.team_id)
    .limit(20)

  if (error) {
    console.error('fatigue_alerts query error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ alerts: alerts ?? [], count: alerts?.length ?? 0 })
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: staffRow } = await supabase
    .from('team_staff').select('team_id').eq('user_id', user.id).single()
  if (!staffRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: AcknowledgeRequest
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { alert_id, action, note } = body
  if (!alert_id || !action) {
    return NextResponse.json({ error: 'alert_id and action are required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('fatigue_alerts')
    .update({
      alert_status: action,
      acknowledged_by: user.id,
      acknowledged_at: new Date().toISOString(),
      acknowledgement_note: note ?? null,
    })
    .eq('id', alert_id)

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  return NextResponse.json({ success: true, alert_id, status: action })
}
