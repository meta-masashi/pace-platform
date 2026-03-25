/**
 * PACE Platform — WORM 監査ログユーティリティ
 *
 * SaMD コンプライアンス対応の Write Once Read Many (WORM) 監査ログ。
 * - データハッシュ生成 (SHA-256)
 * - 監査エントリの作成
 * - 整合性検証
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 監査エントリ作成パラメータ */
export interface AuditEntryParams {
  orgId: string;
  staffId: string;
  athleteId: string;
  action: 'approve' | 'edit_approve' | 'reject';
  menuJson?: unknown;
  evidenceText: string;
  nlgText?: string;
  riskScore?: number;
  diagnosisContext?: unknown;
}

/** 監査エントリ（DB レコード） */
export interface AuditEntry {
  id: string;
  org_id: string;
  staff_id: string;
  athlete_id: string;
  action: string;
  approved_menu_json: unknown | null;
  evidence_text_snapshot: string;
  nlg_text_snapshot: string | null;
  data_hash: string;
  risk_score: number | null;
  diagnosis_context: unknown | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// データハッシュ生成
// ---------------------------------------------------------------------------

/**
 * SHA-256 ハッシュを生成する。
 *
 * evidenceText + menuJson + timestamp の結合文字列から
 * 改ざん検知用のハッシュ値を算出する。
 *
 * @param evidenceText - エビデンステキスト
 * @param menuJson - 承認メニュー JSON（任意）
 * @param timestamp - タイムスタンプ文字列
 * @returns SHA-256 ハッシュ文字列 (hex)
 */
export async function generateDataHash(
  evidenceText: string,
  menuJson: unknown,
  timestamp: string
): Promise<string> {
  const payload = JSON.stringify({
    evidenceText,
    menuJson: menuJson ?? null,
    timestamp,
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// 監査エントリ作成
// ---------------------------------------------------------------------------

/**
 * WORM 監査エントリを作成（INSERT）する。
 *
 * @param supabase - 認証済み Supabase クライアント
 * @param params - 監査エントリパラメータ
 * @returns 作成された監査エントリ
 * @throws Error — INSERT 失敗時
 */
export async function createAuditEntry(
  supabase: SupabaseClient,
  params: AuditEntryParams
): Promise<AuditEntry> {
  const timestamp = new Date().toISOString();
  const dataHash = await generateDataHash(
    params.evidenceText,
    params.menuJson,
    timestamp
  );

  const { data, error } = await supabase
    .from('approval_audit_logs')
    .insert({
      org_id: params.orgId,
      staff_id: params.staffId,
      athlete_id: params.athleteId,
      action: params.action,
      approved_menu_json: params.menuJson ?? null,
      evidence_text_snapshot: params.evidenceText,
      nlg_text_snapshot: params.nlgText ?? null,
      data_hash: dataHash,
      risk_score: params.riskScore ?? null,
      diagnosis_context: params.diagnosisContext ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`監査ログの記録に失敗しました: ${error?.message ?? '不明なエラー'}`);
  }

  return data as AuditEntry;
}

// ---------------------------------------------------------------------------
// 整合性検証
// ---------------------------------------------------------------------------

/**
 * 監査エントリの整合性を検証する。
 *
 * 保存されたハッシュ値と、エントリの内容から再計算したハッシュ値を比較する。
 *
 * @param entry - 検証対象の監査エントリ
 * @returns ハッシュが一致すれば true
 */
export async function verifyAuditIntegrity(entry: AuditEntry): Promise<boolean> {
  const recomputedHash = await generateDataHash(
    entry.evidence_text_snapshot,
    entry.approved_menu_json,
    entry.created_at
  );
  return recomputedHash === entry.data_hash;
}
