/**
 * lib/billing/plan-gates.ts
 * ============================================================
 * プラン別機能ゲート（スタブ）
 *
 * Stripe 決済モジュールは Sprint 7 で廃止。
 * 全機能を無制限に開放するスタブ実装。
 * 決済機能を再実装する場合はこのファイルを差し替えること。
 * ============================================================
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AccessResult {
  allowed: boolean;
  reason?: string;
}

/**
 * 指定機能へのアクセス可否を判定する（スタブ: 常に許可）
 */
export async function canAccess(
  _supabase: SupabaseClient,
  _orgId: string,
  _feature: string,
): Promise<AccessResult> {
  return { allowed: true };
}

/**
 * 指定機能へのアクセスを要求する（スタブ: 常に許可）
 * アクセス不可の場合は Error をスローする（現在は常にパス）
 */
export async function requireAccess(
  _supabase: SupabaseClient,
  _orgId: string,
  _feature: string,
): Promise<void> {
  // no-op: 全機能開放
}
