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
// インメモリ・フォールバック（DB 不可時の保守的レート制限）
// ---------------------------------------------------------------------------

/** インメモリ・フォールバック上限（保守的: 10 req/min per user） */
const FALLBACK_LIMIT_PER_MIN = 10;

/** スライディングウィンドウ: ユーザー×エンドポイント → タイムスタンプ配列 */
const inMemoryWindow = new Map<string, number[]>();

/**
 * インメモリ・スライディングウィンドウでレートリミットをチェックする。
 * DB 不可時のフォールバックとして使用。
 */
function checkInMemoryRateLimit(staffId: string, endpoint: string): RateLimitResult {
  const key = `${staffId}:${endpoint}`;
  const now = Date.now();
  const windowMs = 60_000;

  // 古いエントリをパージ
  const timestamps = (inMemoryWindow.get(key) ?? []).filter(
    (ts) => now - ts < windowMs,
  );

  if (timestamps.length >= FALLBACK_LIMIT_PER_MIN) {
    inMemoryWindow.set(key, timestamps);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(now + windowMs),
      reason: 'per_minute',
    };
  }

  timestamps.push(now);
  inMemoryWindow.set(key, timestamps);

  return {
    allowed: true,
    remaining: FALLBACK_LIMIT_PER_MIN - timestamps.length,
    resetAt: new Date(now + windowMs),
  };
}

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
  endpoint: string,
  orgId?: string,
): Promise<RateLimitResult> {
  const supabase = await getServiceClient();
  if (!supabase) {
    // DB接続不可: インメモリフォールバック（保守的上限）
    return checkInMemoryRateLimit(staffId, endpoint);
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

    let dailyCount: number | null = null;

    if (orgId) {
      // org 全体のスタッフ ID を取得してまとめてクエリ
      const { data: orgStaff } = await supabase
        .from("staff")
        .select("id")
        .eq("org_id", orgId);

      if (orgStaff && orgStaff.length > 0) {
        const orgStaffIds = orgStaff.map((s) => s.id as string);
        const { count } = await supabase
          .from("gemini_token_log")
          .select("id", { count: "exact", head: true })
          .in("staff_id", orgStaffIds)
          .gte("called_at", todayStart.toISOString());
        dailyCount = count;
      }
    }

    if (dailyCount === null) {
      // orgId 未指定 or org スタッフ取得失敗時はフォールバック（個人）
      const { count } = await supabase
        .from("gemini_token_log")
        .select("id", { count: "exact", head: true })
        .eq("staff_id", staffId)
        .gte("called_at", todayStart.toISOString());
      dailyCount = count;
    }

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
    // DB クエリ失敗: インメモリフォールバック（保守的上限）
    console.warn("[rate-limiter] レートリミットチェック失敗（インメモリフォールバック）:", err);
    return checkInMemoryRateLimit(staffId, endpoint);
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
// 月次トークン予算チェック
// ---------------------------------------------------------------------------

/** プラン別月次トークン上限 */
const MONTHLY_TOKEN_LIMITS: Record<string, number> = {
  standard: 50_000,
  pro: 500_000,
  pro_cv: 500_000,
  enterprise: Infinity,
};

export interface MonthlyBudgetResult {
  allowed: boolean;
  usage: number;
  limit: number;
}

/**
 * 組織の月次トークン予算をチェックする。
 *
 * @param orgId 組織 ID
 * @returns 予算チェック結果
 */
export async function checkMonthlyBudget(orgId: string): Promise<MonthlyBudgetResult> {
  const supabase = await getServiceClient();
  if (!supabase) {
    // DB接続不可: 保守的にブロック（checkRateLimitと異なり予算超過は安全側に倒す）
    console.warn('[rate-limiter] 月次予算チェック: DB接続不可（保守的拒否）');
    return { allowed: false, usage: 0, limit: 0 };
  }

  try {
    // プラン取得
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('org_id', orgId)
      .single();

    const plan = (subscription?.plan as string) ?? 'standard';
    const limit = MONTHLY_TOKEN_LIMITS[plan] ?? MONTHLY_TOKEN_LIMITS.standard!;

    if (limit === Infinity) {
      return { allowed: true, usage: 0, limit: Infinity };
    }

    // 当月のトークン使用量を集計
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // orgId に紐づくスタッフの使用量を合計
    const { data: staffMembers } = await supabase
      .from('staff')
      .select('id')
      .eq('org_id', orgId);

    if (!staffMembers || staffMembers.length === 0) {
      return { allowed: true, usage: 0, limit };
    }

    const staffIds = staffMembers.map((s) => s.id as string);

    const { data: usageRows } = await supabase
      .from('gemini_token_log')
      .select('estimated_tokens')
      .in('staff_id', staffIds)
      .gte('called_at', monthStart.toISOString());

    const totalUsage = (usageRows ?? []).reduce(
      (sum, row) => sum + ((row.estimated_tokens as number) ?? 0),
      0,
    );

    if (totalUsage >= limit) {
      console.warn(
        `[rate-limiter] 月次トークン予算超過: orgId=${orgId} usage=${totalUsage}/${limit}`,
      );
      return { allowed: false, usage: totalUsage, limit };
    }

    // 80% 到達時に警告
    if (totalUsage >= limit * 0.8) {
      console.warn(
        `[rate-limiter] 月次トークン予算 80% 到達: orgId=${orgId} usage=${totalUsage}/${limit}`,
      );
    }

    return { allowed: true, usage: totalUsage, limit };
  } catch (err) {
    // DB クエリ失敗: 保守的にブロック（コスト保護のため安全側に倒す）
    console.warn('[rate-limiter] 月次予算チェック失敗（保守的拒否）:', err);
    return { allowed: false, usage: 0, limit: 0 };
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

// ---------------------------------------------------------------------------
// テスト用エクスポート
// ---------------------------------------------------------------------------

/** テスト用: インメモリウィンドウをクリアする */
export function _clearInMemoryWindow(): void {
  inMemoryWindow.clear();
}
