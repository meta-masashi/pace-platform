/**
 * PACE Platform — 監査ログユーティリティ
 *
 * API ルート横断で使用する統一的な監査ログ記録関数。
 * audit_logs テーブルへの INSERT をラップし、
 * 認証コンテキストから staff_id と org_id を自動取得する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 監査ログイベントパラメータ */
export interface AuditEventParams {
  /** アクション名（例: 'lock_create', 'rehab_phase_advance'） */
  action: string;
  /** 対象リソースの種別（例: 'athlete_lock', 'rehab_program'） */
  targetType: string;
  /** 対象リソースの ID */
  targetId: string;
  /** 追加の詳細情報 */
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 監査ログ記録
// ---------------------------------------------------------------------------

/**
 * 監査ログイベントを記録する。
 *
 * 認証済み Supabase クライアントからユーザー情報を取得し、
 * audit_logs テーブルに INSERT する。
 *
 * ログ記録の失敗はアプリケーションの処理を中断しないよう、
 * エラーは警告ログに記録するのみとする。
 *
 * @param supabase 認証済み Supabase クライアント
 * @param params 監査ログイベントパラメータ
 */
export async function logAuditEvent(
  supabase: SupabaseClient,
  params: AuditEventParams,
): Promise<void> {
  try {
    // 認証コンテキストからユーザー情報を取得
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn('[audit] 監査ログ記録スキップ: 認証ユーザーが取得できません');
      return;
    }

    // スタッフ情報（org_id）を取得
    const { data: staff } = await supabase
      .from('staff')
      .select('org_id')
      .eq('id', user.id)
      .single();

    const { error } = await supabase.from('audit_logs').insert({
      user_id: user.id,
      org_id: staff?.org_id ?? null,
      action: params.action,
      resource_type: params.targetType,
      resource_id: params.targetId,
      details: params.details ?? null,
    });

    if (error) {
      console.warn('[audit] 監査ログ記録失敗:', error.message);
    }
  } catch (err) {
    console.warn('[audit] 監査ログ記録中に予期しないエラー:', err);
  }
}
