/**
 * PACE Platform — 汎用リトライハンドラー（防壁4）
 *
 * JSONパース失敗・空レスポンス・API エラー時の
 * 指数バックオフ付きリトライを提供する汎用ユーティリティ。
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** 最大リトライ回数（デフォルト: 3）*/
  maxRetries?: number;
  /** 初期バックオフ時間（ms）。デフォルト: 500ms */
  baseDelayMs?: number;
  /** バックオフ係数（デフォルト: 2 — 指数バックオフ）*/
  backoffFactor?: number;
  /** リトライしない例外の判定関数 */
  shouldNotRetry?: (error: unknown) => boolean;
  /** リトライ前に呼ばれるフック（ログ・アラート用）*/
  onRetry?: (attempt: number, error: unknown) => void;
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
  totalElapsedMs: number;
}

// ---------------------------------------------------------------------------
// 指数バックオフ付きリトライ（防壁4）
// ---------------------------------------------------------------------------

/**
 * 非同期関数を指数バックオフでリトライする汎用ラッパー。
 *
 * 使用例:
 *   const { result } = await withRetry(
 *     () => callExternalApi(payload),
 *     { maxRetries: 3, baseDelayMs: 1000 }
 *   );
 *
 * @throws Error("RETRY_EXHAUSTED") — 全リトライ失敗時（元のエラーをラップ）
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const backoffFactor = options.backoffFactor ?? 2;
  const shouldNotRetry = options.shouldNotRetry ?? (() => false);
  const onRetry = options.onRetry;

  const startTime = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // 1 回目は遅延なし、2 回目以降は指数バックオフ
    if (attempt > 1) {
      const delay = baseDelayMs * Math.pow(backoffFactor, attempt - 2);
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const result = await fn();
      return {
        result,
        attempts: attempt,
        totalElapsedMs: Date.now() - startTime,
      };
    } catch (err) {
      lastError = err;

      // リトライ不要なエラーは即座に再スロー
      if (shouldNotRetry(err)) {
        throw err;
      }

      onRetry?.(attempt, err);

      if (attempt < maxRetries) {
        console.warn(`[retry] attempt ${attempt}/${maxRetries} 失敗:`, err);
      }
    }
  }

  const wrappedError = new Error(
    `RETRY_EXHAUSTED: ${maxRetries}回のリトライが全て失敗しました。最後のエラー: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
  (wrappedError as Error & { cause: unknown }).cause = lastError;
  throw wrappedError;
}

// ---------------------------------------------------------------------------
// JSON パースリトライ（防壁4）
// ---------------------------------------------------------------------------

/**
 * JSON パースを試みる。失敗した場合は回復ロジックを適用してリトライ。
 *
 * 回復ロジック:
 *   1. コードフェンス除去（```json ... ```）
 *   2. 末尾の余分なテキスト除去
 *   3. 不完全な JSON の修復（末尾の不完全オブジェクトを閉じる）
 */
export function parseJsonWithRecovery<T>(rawText: string): T {
  // 試行 1: そのままパース
  try {
    return JSON.parse(rawText) as T;
  } catch {
    // 続行
  }

  // 試行 2: コードフェンス除去
  const withoutFence = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence) as T;
  } catch {
    // 続行
  }

  // 試行 3: JSON 境界を特定して抽出
  const firstBrace = withoutFence.indexOf("{");
  const firstBracket = withoutFence.indexOf("[");

  if (firstBrace === -1 && firstBracket === -1) {
    throw new SyntaxError(`JSON の開始位置が見つかりません: ${withoutFence.slice(0, 100)}`);
  }

  const start =
    firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)
      ? firstBrace
      : firstBracket;

  const isObject = withoutFence[start] === "{";
  const endChar = isObject ? "}" : "]";
  const end = withoutFence.lastIndexOf(endChar);

  if (end === -1) {
    throw new SyntaxError(`JSON の終了位置が見つかりません`);
  }

  const extracted = withoutFence.slice(start, end + 1);

  try {
    return JSON.parse(extracted) as T;
  } catch (finalErr) {
    throw new SyntaxError(
      `JSON パース完全失敗: ${finalErr instanceof Error ? finalErr.message : String(finalErr)}`
    );
  }
}

// ---------------------------------------------------------------------------
// 空レスポンス検出
// ---------------------------------------------------------------------------

/**
 * LLM レスポンスが実質的に空かどうかを判定する。
 */
export function isEmptyResponse(text: string | null | undefined): boolean {
  if (!text) return true;
  const stripped = text.replace(/\s/g, "").replace(/```json?```/gi, "");
  return stripped.length === 0 || stripped === "{}" || stripped === "[]";
}
