/**
 * PACE Platform — 入力バリデーションユーティリティ
 *
 * API ルート全体で使用する共通バリデーション関数群。
 * UUID、メールアドレス、日付文字列、ページネーション等の検証を行う。
 */

// ---------------------------------------------------------------------------
// UUID バリデーション
// ---------------------------------------------------------------------------

/** UUID v4 正規表現パターン */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 文字列が有効な UUID 形式であるかを検証する。
 *
 * @param input 検証対象の文字列
 * @returns 有効な UUID の場合 true
 */
export function validateUUID(input: string): boolean {
  if (typeof input !== 'string') return false;
  return UUID_PATTERN.test(input);
}

// ---------------------------------------------------------------------------
// メールアドレスバリデーション
// ---------------------------------------------------------------------------

/**
 * メールアドレスの基本的な形式を検証する。
 *
 * RFC 5322 の完全準拠ではなく、実用的なパターンで検証する。
 *
 * @param input 検証対象の文字列
 * @returns 有効なメールアドレス形式の場合 true
 */
export function validateEmail(input: string): boolean {
  if (typeof input !== 'string') return false;
  if (input.length > 254) return false;

  const emailPattern =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailPattern.test(input);
}

// ---------------------------------------------------------------------------
// 日付文字列バリデーション
// ---------------------------------------------------------------------------

/**
 * ISO 8601 日付文字列（YYYY-MM-DD）の形式と妥当性を検証する。
 *
 * 形式だけでなく、実際に有効な日付であるかも確認する。
 *
 * @param input 検証対象の文字列
 * @returns 有効な日付文字列の場合 true
 */
export function validateDateString(input: string): boolean {
  if (typeof input !== 'string') return false;

  // YYYY-MM-DD 形式チェック
  const datePattern = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
  if (!datePattern.test(input)) return false;

  // 日付の妥当性チェック（例: 2月30日は無効）
  const parsed = new Date(input + 'T00:00:00Z');
  if (isNaN(parsed.getTime())) return false;

  // パースされた日付が入力と一致するかを確認（例: 2月31日→3月3日にならないこと）
  const [year, month, day] = input.split('-').map(Number) as [number, number, number];
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

// ---------------------------------------------------------------------------
// 文字列サニタイズ
// ---------------------------------------------------------------------------

/**
 * 文字列をサニタイズする。
 *
 * - 前後の空白を除去
 * - 制御文字（\x00-\x08, \x0B, \x0C, \x0E-\x1F）を除去
 * - 最大文字数で切り詰め
 *
 * @param input サニタイズ対象の文字列
 * @param maxLength 最大文字数（デフォルト: 1000）
 * @returns サニタイズ済み文字列
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
  if (typeof input !== 'string') return '';

  return input
    .trim()
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .slice(0, maxLength);
}

// ---------------------------------------------------------------------------
// ページネーションバリデーション
// ---------------------------------------------------------------------------

/** ページネーションパラメータ */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/** バリデーション済みページネーション */
export interface ValidatedPagination {
  limit: number;
  offset: number;
}

/** ページネーション制約 */
const PAGINATION_DEFAULTS = {
  MIN_LIMIT: 1,
  MAX_LIMIT: 100,
  DEFAULT_LIMIT: 20,
  MIN_OFFSET: 0,
  MAX_OFFSET: 10_000,
  DEFAULT_OFFSET: 0,
} as const;

/**
 * ページネーションパラメータをバリデーションし、安全な範囲にクランプする。
 *
 * @param params ページネーションパラメータ
 * @returns バリデーション済みページネーション
 */
export function validatePagination(params: PaginationParams): ValidatedPagination {
  let limit: number = PAGINATION_DEFAULTS.DEFAULT_LIMIT;
  let offset: number = PAGINATION_DEFAULTS.DEFAULT_OFFSET;

  if (params.limit !== undefined && params.limit !== null) {
    const parsed = Number(params.limit);
    if (!isNaN(parsed) && isFinite(parsed)) {
      limit = Math.max(
        PAGINATION_DEFAULTS.MIN_LIMIT,
        Math.min(Math.floor(parsed), PAGINATION_DEFAULTS.MAX_LIMIT),
      );
    }
  }

  if (params.offset !== undefined && params.offset !== null) {
    const parsed = Number(params.offset);
    if (!isNaN(parsed) && isFinite(parsed)) {
      offset = Math.max(
        PAGINATION_DEFAULTS.MIN_OFFSET,
        Math.min(Math.floor(parsed), PAGINATION_DEFAULTS.MAX_OFFSET),
      );
    }
  }

  return { limit, offset };
}
