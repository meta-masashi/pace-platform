/**
 * lib/audit/worm.ts
 * ============================================================
 * WORM 監査ログ（スタブ）
 *
 * Sprint 7 で完全監査ログ機能を廃止。
 * 呼び出し元の互換性を維持するスタブ実装。
 * 監査ログを再実装する場合はこのファイルを差し替えること。
 * ============================================================
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/observability/logger';
const log = createLogger('security');

export interface AuditEntryParams {
  orgId: string;
  staffId: string;
  athleteId: string;
  action: string;
  evidenceText?: string;
  menuJson?: unknown;
  nlgText?: string;
  riskScore?: number;
  diagnosisContext?: unknown;
  riskLevel?: string;
}

export interface AuditEntry {
  id: string;
  created_at: string;
  data_hash: string;
}

/**
 * 監査エントリを作成する（スタブ: console.info のみ）
 */
export async function createAuditEntry(
  _supabase: SupabaseClient,
  entry: AuditEntryParams,
): Promise<AuditEntry> {
  log.info('stub: createAuditEntry', { data: { action: entry.action, athleteId: entry.athleteId } });
  return {
    id: `stub-${Date.now()}`,
    created_at: new Date().toISOString(),
    data_hash: 'stub-no-hash',
  };
}
