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
      `JSON パース完全失敗: ${finalErr instanceof Error ? finalErr.message : String(finalErr)}`,
      { cause: finalErr },
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

// ---------------------------------------------------------------------------
// タイムアウト付き実行（防壁4）
// ---------------------------------------------------------------------------

/**
 * 指定ミリ秒でタイムアウトする Promise ラッパー。
 *
 * @param fn        実行する非同期関数
 * @param timeoutMs タイムアウト時間（ミリ秒）
 * @throws Error("TIMEOUT") — タイムアウト発生時
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`TIMEOUT: ${timeoutMs}ms を超過しました`));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ---------------------------------------------------------------------------
// テキストフォールバック抽出（防壁4）
// ---------------------------------------------------------------------------

/** テキストフォールバックの戻り値型 */
export interface TextFallbackResult<T> {
  /** パース成功時の結果（フォールバック時は null）*/
  parsed: T | null;
  /** フォールバック時の生テキスト（パース成功時は null）*/
  rawText: string | null;
  /** フォールバックが使用されたか */
  isFallback: boolean;
}

/**
 * JSON パースをリトライし、全リトライ失敗時はテキストフォールバックを返す。
 *
 * Gemini が JSON 形式で返すことを期待するが、返せなかった場合に
 * 有用なテキスト部分を抽出してフォールバック結果として返す。
 *
 * @param rawText   Gemini からの生レスポンステキスト
 * @param parser    JSON パーサー関数
 * @returns パース結果またはテキストフォールバック
 */
export function parseWithTextFallback<T>(
  rawText: string,
  parser?: (text: string) => T
): TextFallbackResult<T> {
  // 1. カスタムパーサーがある場合はそれを試行
  if (parser) {
    try {
      const result = parser(rawText);
      return { parsed: result, rawText: null, isFallback: false };
    } catch {
      // カスタムパーサー失敗 → parseJsonWithRecovery にフォールバック
    }
  }

  // 2. parseJsonWithRecovery で回復を試行
  try {
    const result = parseJsonWithRecovery<T>(rawText);
    return { parsed: result, rawText: null, isFallback: false };
  } catch {
    // JSON パース完全失敗 → テキストフォールバック
  }

  // 3. テキストフォールバック: 有用な部分を抽出
  const extracted = extractUsableText(rawText);
  console.warn(
    `[retry-handler] JSON パース失敗 — テキストフォールバック使用（${extracted.length}文字）`
  );

  return { parsed: null, rawText: extracted, isFallback: true };
}

/**
 * Gemini レスポンスから有用なテキスト部分を抽出する。
 * コードフェンス・マークダウン装飾を除去し、日本語テキストを優先的に返す。
 */
function extractUsableText(raw: string): string {
  let text = raw;

  // コードフェンスを除去
  text = text.replace(/```[\s\S]*?```/g, "");

  // マークダウンの見出しマーカーを除去
  text = text.replace(/^#{1,6}\s*/gm, "");

  // 箇条書きマーカーを除去
  text = text.replace(/^[\s]*[-*+]\s*/gm, "");

  // 連続空行を圧縮
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
