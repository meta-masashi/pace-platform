/**
 * PACE Platform — Gemini API レートリミッター（防壁3: コスト保護）
 *
 * 責務:
 *   - ユーザー別・エンドポイント別のレートリミットチェック（毎分/日次）
 *   - 組織単位の日次コール上限チェック
 *   - トークン使用量のログ記録（gemini_token_log テーブル）
 *
 * 設定:
 *   - GEMINI_RATE_LIMIT_PER_MIN: 1ユーザーあたりの毎分上限（デフォルト: 20）
 *   - GEMINI_MONTHLY_CALL_LIMIT: 組織あたりの日次上限（デフォルト: 500）
 *
 * 障害時動作:
 *   DB 接続不可の場合はフェイルオープン（リクエストをブロックしない）
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** レートリミットチェック結果 */
export interface RateLimitResult {
  /** リクエストが許可されるか */
  allowed: boolean;
  /** 残りリクエスト数 */
  remaining: number;
  /** リセットされる時刻 */
  resetAt: Date;
  /** 超過した場合の理由 */
  reason?: "per_minute" | "daily_org";
}

/** トークン使用量ログのパラメータ */
export interface TokenUsageParams {
  staffId: string;
  endpoint: string;
  inputChars: number;
  estimatedTokens: number;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 毎分レートリミット（環境変数で上書き可能）*/
const RATE_LIMIT_PER_MIN = Number(process.env.GEMINI_RATE_LIMIT_PER_MIN ?? 20);

/** 組織あたりの日次コール上限（環境変数で上書き可能）*/
const DAILY_ORG_LIMIT = Number(process.env.GEMINI_MONTHLY_CALL_LIMIT ?? 500);

// ---------------------------------------------------------------------------
// Supabase クライアント取得（遅延ロード）
// ---------------------------------------------------------------------------

async function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// レートリミットチェック（防壁3）
// ---------------------------------------------------------------------------

/**
 * ユーザー別・エンドポイント別のレートリミットをチェックする。
 *
 * チェック項目:
 *   1. 毎分レートリミット（ユーザー×エンドポイント単位）
 *   2. 日次組織コール上限（全エンドポイント合計）
 *
 * @param staffId  スタッフ ID
 * @param endpoint エンドポイント識別子（例: "rehab-generator"）
 * @returns レートリミットチェック結果
 */
export async function checkRateLimit(
  staffId: string,
  endpoint: string
): Promise<RateLimitResult> {
  const supabase = await getServiceClient();
  if (!supabase) {
    // DB接続不可: フェイルオープン
    return {
      allowed: true,
      remaining: RATE_LIMIT_PER_MIN,
      resetAt: new Date(Date.now() + 60_000),
    };
  }

  try {
    // --- 毎分レートリミットチェック ---
    const windowStart = new Date(Date.now() - 60_000).toISOString();
    const { count: minuteCount } = await supabase
      .from("gemini_token_log")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", staffId)
      .eq("endpoint", endpoint)
      .gte("called_at", windowStart);

    const currentMinuteCount = minuteCount ?? 0;

    if (currentMinuteCount >= RATE_LIMIT_PER_MIN) {
      console.warn(
        `[rate-limiter] 毎分上限超過: staffId=${staffId} endpoint=${endpoint} count=${currentMinuteCount}/${RATE_LIMIT_PER_MIN}`
      );
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + 60_000),
        reason: "per_minute",
      };
    }

    // --- 日次組織コール上限チェック ---
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count: dailyCount } = await supabase
      .from("gemini_token_log")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", staffId)
      .gte("called_at", todayStart.toISOString());

    const currentDailyCount = dailyCount ?? 0;

    if (currentDailyCount >= DAILY_ORG_LIMIT) {
      const tomorrow = new Date(todayStart);
      tomorrow.setDate(tomorrow.getDate() + 1);

      console.warn(
        `[rate-limiter] 日次上限超過: staffId=${staffId} count=${currentDailyCount}/${DAILY_ORG_LIMIT}`
      );
      return {
        allowed: false,
        remaining: 0,
        resetAt: tomorrow,
        reason: "daily_org",
      };
    }

    return {
      allowed: true,
      remaining: RATE_LIMIT_PER_MIN - currentMinuteCount,
      resetAt: new Date(Date.now() + 60_000),
    };
  } catch (err) {
    // DB クエリ失敗: フェイルオープン
    console.warn("[rate-limiter] レートリミットチェック失敗（フェイルオープン）:", err);
    return {
      allowed: true,
      remaining: RATE_LIMIT_PER_MIN,
      resetAt: new Date(Date.now() + 60_000),
    };
  }
}

// ---------------------------------------------------------------------------
// トークン使用量ログ（防壁3）
// ---------------------------------------------------------------------------

/**
 * Gemini API コールのトークン使用量を gemini_token_log テーブルに記録する。
 *
 * ベストエフォート: ログ失敗はリクエストをブロックしない。
 *
 * @param params トークン使用量パラメータ
 */
export async function logTokenUsage(params: TokenUsageParams): Promise<void> {
  const supabase = await getServiceClient();
  if (!supabase) return;

  try {
    const { error } = await supabase.from("gemini_token_log").insert({
      staff_id: params.staffId,
      endpoint: params.endpoint,
      input_chars: params.inputChars,
      estimated_tokens: params.estimatedTokens,
      called_at: new Date().toISOString(),
    });

    if (error) {
      console.warn("[rate-limiter] トークンログ記録失敗:", error.message);
    }
  } catch (err) {
    // トークンログ失敗はリクエストをブロックしない
    console.warn("[rate-limiter] トークンログ記録例外:", err);
  }
}

// ---------------------------------------------------------------------------
// 429 レスポンスヘルパー
// ---------------------------------------------------------------------------

/**
 * レートリミット超過時の 429 レスポンスボディを構築する。
 *
 * @param rateLimitResult checkRateLimit の結果
 * @returns レスポンスボディ + Retry-After 秒数
 */
export function buildRateLimitResponse(rateLimitResult: RateLimitResult): {
  body: { success: false; error: string; retryAfter: number };
  retryAfterSeconds: number;
} {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1_000)
  );

  const reasonMessage =
    rateLimitResult.reason === "per_minute"
      ? "APIリクエストの毎分上限に達しました。"
      : "APIリクエストの日次上限に達しました。";

  return {
    body: {
      success: false,
      error: `${reasonMessage}${retryAfterSeconds}秒後に再試行してください。`,
      retryAfter: retryAfterSeconds,
    },
    retryAfterSeconds,
  };
}
