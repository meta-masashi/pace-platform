import type { Metadata } from 'next'
import TeamFatigueDashboard from './TeamFatigueDashboard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'チーム疲労タイムライン | PACE Platform',
  description: 'DBN予測による チーム全体の疲労リスクタイムライン（S&C向け）',
}

export default function TeamFatiguePage() {
  return <TeamFatigueDashboard />
}
