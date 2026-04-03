/**
 * PACE Platform — S2S データ取り込み API
 *
 * POST /api/s2s/ingest
 *
 * 外部デバイスプロバイダーからのマシン間データ送信エンドポイント。
 * Supabase JWT ではなく API キー認証を使用する。
 *
 * 認証方法:
 *   Authorization: Bearer <API_KEY>
 *
 * レートリミット: API キーあたり 100リクエスト/時
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { validateApiKey, ingestS2SData, validatePayload } from "@/lib/s2s/ingestor";
import { withApiHandler } from "@/lib/api/handler";
import type { S2SResult } from "@/lib/s2s/types";

// ---------------------------------------------------------------------------
// レスポンス型
// ---------------------------------------------------------------------------

interface SuccessResponse {
  success: true;
  data: S2SResult;
}

interface ErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// レートリミット（インメモリ — 本番では Redis 推奨）
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1時間

/**
 * レートリミットチェック。
 *
 * @param key - レートリミットキー（API キーハッシュ）
 * @returns 制限内なら true
 */
function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/s2s/ingest
// ---------------------------------------------------------------------------

export const POST = withApiHandler(async (req, ctx) => {
  // ----- API キー取得 -----
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      {
        success: false,
        error: "Authorization ヘッダーに Bearer トークンが必要です。",
      },
      { status: 401 }
    );
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey || apiKey.length < 32) {
    return NextResponse.json(
      { success: false, error: "API キーが不正です。" },
      { status: 401 }
    );
  }

  // ----- リクエストボディのパース -----
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "リクエストボディの JSON パースに失敗しました。" },
      { status: 400 }
    );
  }

  // ----- ペイロードバリデーション -----
  const validation = validatePayload(body);
  if (!validation.valid) {
    return NextResponse.json(
      { success: false, error: validation.error },
      { status: 400 }
    );
  }

  // ----- サービスロールクライアント（S2S は JWT 認証ではないため） -----
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // S2S ではCookie不要
        },
      },
    }
  );

  // ----- API キー検証 -----
  const orgId = await validateApiKey(
    supabase,
    apiKey,
    validation.payload.provider
  );

  if (!orgId) {
    return NextResponse.json(
      {
        success: false,
        error: "無効な API キーです。資格情報を確認してください。",
      },
      { status: 401 }
    );
  }

  // ----- レートリミットチェック -----
  if (!checkRateLimit(orgId + ":" + validation.payload.provider)) {
    return NextResponse.json(
      {
        success: false,
        error: "レートリミット超過です。1時間あたり最大100リクエストまでです。",
      },
      {
        status: 429,
        headers: {
          "Retry-After": "3600",
        },
      }
    );
  }

  // ----- データ取り込み実行 -----
  const result = await ingestS2SData(
    supabase,
    {
      ...validation.payload,
      apiKey, // 取り込み処理では使用しないが型の整合性のため
    },
    orgId
  );

  // ----- 監査ログ -----
  await supabase
    .from("audit_logs")
    .insert({
      user_id: null, // S2S はユーザーなし
      action: "s2s_ingest",
      resource_type: "daily_metrics",
      resource_id: orgId,
      details: {
        provider: validation.payload.provider,
        team_id: validation.payload.teamId,
        received: result.received,
        matched: result.matched,
        unmatched_count: result.unmatched.length,
        error_count: result.errors.length,
      },
    })
    .then(({ error }) => {
      if (error) ctx.log.warn("監査ログ記録失敗", { detail: error });
    });

  return NextResponse.json({
    success: true,
    data: result,
  });
}, { service: 's2s' });
