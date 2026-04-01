/**
 * PACE Platform — Supabase 型安全ヘルパー
 *
 * Supabase クエリ結果の unknown 型を安全にキャストするユーティリティ。
 * `as string` や `as unknown as T` の代わりにこれらの関数を使用する。
 */

/**
 * Supabase の行データから文字列を安全に取得する。
 * null/undefined の場合はデフォルト値を返す。
 */
export function getString(row: Record<string, unknown>, key: string, defaultValue = ''): string {
  const val = row[key];
  if (val === null || val === undefined) return defaultValue;
  return String(val);
}

/**
 * Supabase の行データから数値を安全に取得する。
 * null/undefined/NaN の場合はデフォルト値を返す。
 */
export function getNumber(row: Record<string, unknown>, key: string, defaultValue = 0): number {
  const val = row[key];
  if (val === null || val === undefined) return defaultValue;
  const num = Number(val);
  if (Number.isNaN(num)) return defaultValue;
  return num;
}

/**
 * Supabase の行データから真偽値を安全に取得する。
 */
export function getBoolean(row: Record<string, unknown>, key: string, defaultValue = false): boolean {
  const val = row[key];
  if (val === null || val === undefined) return defaultValue;
  return Boolean(val);
}

/**
 * Supabase の行データから日付文字列を安全に取得する。
 */
export function getDateString(row: Record<string, unknown>, key: string, defaultValue = ''): string {
  const val = row[key];
  if (val === null || val === undefined) return defaultValue;
  return String(val);
}

/**
 * Supabase の JSONB カラムを安全にパースする。
 * `as unknown as T` の代わりに使用。
 */
export function getJSON<T>(row: Record<string, unknown>, key: string): T | null {
  const val = row[key];
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return val as T;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Supabase の行データからロール文字列を安全に取得し、既知のロールか検証する。
 */
export type StaffRole = 'master' | 'AT' | 'PT' | 'S&C';

const VALID_ROLES: Set<string> = new Set(['master', 'AT', 'PT', 'S&C']);

export function getRole(row: Record<string, unknown>, key = 'role'): StaffRole | null {
  const val = getString(row, key);
  if (VALID_ROLES.has(val)) return val as StaffRole;
  return null;
}

/**
 * ロールが指定のロールと一致するか検証する。
 * `(staff.role as string) === 'master'` の代わりに使用。
 */
export function isRole(row: Record<string, unknown>, role: StaffRole, key = 'role'): boolean {
  return getRole(row, key) === role;
}

/**
 * ロールがマスターか検証する。
 */
export function isMasterRole(row: Record<string, unknown>, key = 'role'): boolean {
  return isRole(row, 'master', key);
}

/**
 * ロールが臨床スタッフか検証する（AT, PT, master）。
 */
export function isClinicalRole(row: Record<string, unknown>, key = 'role'): boolean {
  const role = getRole(row, key);
  return role === 'master' || role === 'AT' || role === 'PT';
}
