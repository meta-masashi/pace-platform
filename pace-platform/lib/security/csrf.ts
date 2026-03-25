/**
 * PACE Platform — CSRF 保護ユーティリティ
 *
 * 状態変更を伴う API ルート（POST, PATCH, DELETE）に対する
 * CSRF トークン生成・検証を提供する。
 *
 * フロントエンド側は X-CSRF-Token ヘッダーにトークンを含めて送信する。
 */

// ---------------------------------------------------------------------------
// CSRF トークン生成
// ---------------------------------------------------------------------------

/**
 * ランダムな CSRF トークンを生成する。
 *
 * crypto.randomUUID() を使用し、十分なエントロピーを持つトークンを返す。
 *
 * @returns ランダムな UUID v4 文字列
 */
export function generateCSRFToken(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// CSRF トークン検証
// ---------------------------------------------------------------------------

/** CSRF トークンヘッダー名 */
const CSRF_HEADER = 'x-csrf-token';

/**
 * リクエストの CSRF トークンを検証する。
 *
 * X-CSRF-Token ヘッダーの存在と形式（UUID v4）を確認する。
 * トークンの値自体はステートレスに検証するため、
 * 有効な UUID 形式であることのみを確認する。
 *
 * 注: より厳密な実装ではサーバー側セッションとの照合が必要だが、
 * 本実装では SameSite Cookie + Origin チェックと組み合わせて使用する前提。
 *
 * @param request リクエストオブジェクト
 * @returns トークンが有効な場合 true
 */
export function validateCSRFToken(request: Request): boolean {
  const token = request.headers.get(CSRF_HEADER);

  if (!token) {
    return false;
  }

  // UUID v4 形式の検証
  const uuidV4Pattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidV4Pattern.test(token);
}
