import type { Metadata } from 'next'
import EnterpriseDashboard from './EnterpriseDashboard'

export const metadata: Metadata = {
  title: 'Enterprise 管理 | PACE Platform',
  description: '複数チーム・組織の一元管理（Enterprise Admin 専用）',
}

export default function EnterprisePage() {
  return <EnterpriseDashboard />
}
