/**
 * PACE Platform — S2S API 資格情報管理
 *
 * POST   /api/s2s/credentials — 新しい API キーを生成
 * GET    /api/s2s/credentials — アクティブな資格情報一覧
 * DELETE /api/s2s/credentials — 資格情報を無効化
 *
 * master ロールのスタッフのみアクセス可能。
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiHandler, ApiError } from "@/lib/api/handler";
import type { DeviceProvider } from "@/lib/s2s/types";

// ---------------------------------------------------------------------------
// レスポンス型
// ---------------------------------------------------------------------------

interface SuccessResponse {
  success: true;
  data: unknown;
}

interface ErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const VALID_PROVIDERS: DeviceProvider[] = [
  "catapult",
  "kinexon",
  "statsports",
  "polar",
  "garmin",
  "custom",
];

// ---------------------------------------------------------------------------
// ヘルパー: master 権限チェック
// ---------------------------------------------------------------------------

async function requireMaster(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "認証が必要です。ログインしてください。", status: 401, user: null, staff: null };
  }

  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single();

  if (staffError || !staff) {
    return { error: "スタッフプロファイルが見つかりません。", status: 403, user: null, staff: null };
  }

  if ((staff.role as string) !== "master") {
    return { error: "S2S 資格情報の管理には master 権限が必要です。", status: 403, user: null, staff: null };
  }

  return { error: null, status: 0, user, staff };
}

// ---------------------------------------------------------------------------
// API キー生成ヘルパー
// ---------------------------------------------------------------------------

/**
 * 暗号的に安全なランダム API キーを生成する。
 * 形式: pace_s2s_{64文字のランダム16進数}
 */
function generateApiKey(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const hex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `pace_s2s_${hex}`;
}

/**
 * API キーの SHA-256 ハッシュを生成する。
 */
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// POST /api/s2s/credentials — 新しい API キーを生成
// ---------------------------------------------------------------------------

export const POST = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();
  const auth = await requireMaster(supabase);
  if (auth.error) {
    throw new ApiError(auth.status, auth.error);
  }

  // ----- リクエストボディ -----
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "リクエストボディの JSON パースに失敗しました。");
  }

  const b = body as Record<string, unknown>;
  const provider = b.provider as string;

  if (!provider || !VALID_PROVIDERS.includes(provider as DeviceProvider)) {
    throw new ApiError(400, `プロバイダーが不正です。有効な値: ${VALID_PROVIDERS.join(", ")}`);
  }

  // ----- 既存の資格情報チェック -----
  const orgId = auth.staff!.org_id as string;
  const { data: existing } = await supabase
    .from("s2s_credentials")
    .select("id, is_active")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .single();

  if (existing?.is_active) {
    throw new ApiError(409, `${provider} の API キーは既に存在します。新しいキーを生成するには、既存のキーを先に無効化してください。`);
  }

  // ----- API キー生成・保存 -----
  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);

  if (existing && !existing.is_active) {
    // 無効化された既存レコードを再有効化
    const { error: updateError } = await supabase
      .from("s2s_credentials")
      .update({
        api_key_hash: apiKeyHash,
        is_active: true,
        updated_at: new Date().toISOString(),
        created_by: auth.user!.id,
      })
      .eq("id", existing.id);

    if (updateError) {
      ctx.log.error("更新エラー", { detail: updateError });
      throw new ApiError(500, "API キーの保存に失敗しました。");
    }
  } else {
    // 新規作成
    const { error: insertError } = await supabase
      .from("s2s_credentials")
      .insert({
        org_id: orgId,
        provider,
        api_key_hash: apiKeyHash,
        is_active: true,
        created_by: auth.user!.id,
      });

    if (insertError) {
      ctx.log.error("挿入エラー", { detail: insertError });
      throw new ApiError(500, "API キーの保存に失敗しました。");
    }
  }

  // ----- 監査ログ -----
  await supabase
    .from("audit_logs")
    .insert({
      user_id: auth.user!.id,
      action: "s2s_credential_create",
      resource_type: "s2s_credentials",
      resource_id: orgId,
      details: { provider },
    })
    .then(({ error }) => {
      if (error) ctx.log.warn("監査ログ記録失敗", { detail: error });
    });

  // API キーは生成時のみ平文で返す（以後は表示不可）
  return NextResponse.json({
    success: true,
    data: {
      provider,
      apiKey,
      message:
        "このAPIキーは一度だけ表示されます。安全な場所に保管してください。",
    },
  });
}, { service: 's2s' });

// ---------------------------------------------------------------------------
// GET /api/s2s/credentials — アクティブな資格情報一覧
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (_req, ctx) => {
  const supabase = await createClient();
  const auth = await requireMaster(supabase);
  if (auth.error) {
    throw new ApiError(auth.status, auth.error);
  }

  const orgId = auth.staff!.org_id as string;

  const { data: credentials, error } = await supabase
    .from("s2s_credentials")
    .select("id, provider, is_active, created_at, updated_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    ctx.log.error("取得エラー", { detail: error });
    throw new ApiError(500, "資格情報の取得に失敗しました。");
  }

  return NextResponse.json({
    success: true,
    data: {
      credentials: (credentials ?? []).map((c) => ({
        id: c.id,
        provider: c.provider,
        isActive: c.is_active,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
    },
  });
}, { service: 's2s' });

// ---------------------------------------------------------------------------
// DELETE /api/s2s/credentials — 資格情報を無効化
// ---------------------------------------------------------------------------

export const DELETE = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();
  const auth = await requireMaster(supabase);
  if (auth.error) {
    throw new ApiError(auth.status, auth.error);
  }

  // ----- リクエストボディ -----
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "リクエストボディの JSON パースに失敗しました。");
  }

  const b = body as Record<string, unknown>;
  const credentialId = b.credentialId as string;

  if (!credentialId) {
    throw new ApiError(400, "credentialId が必要です。");
  }

  // ----- 無効化（論理削除） -----
  const orgId = auth.staff!.org_id as string;
  const { error: updateError, count } = await supabase
    .from("s2s_credentials")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", credentialId)
    .eq("org_id", orgId);

  if (updateError) {
    ctx.log.error("無効化エラー", { detail: updateError });
    throw new ApiError(500, "資格情報の無効化に失敗しました。");
  }

  if (count === 0) {
    throw new ApiError(404, "指定された資格情報が見つかりません。");
  }

  // ----- 監査ログ -----
  await supabase
    .from("audit_logs")
    .insert({
      user_id: auth.user!.id,
      action: "s2s_credential_revoke",
      resource_type: "s2s_credentials",
      resource_id: credentialId,
      details: { org_id: orgId },
    })
    .then(({ error }) => {
      if (error) ctx.log.warn("監査ログ記録失敗", { detail: error });
    });

  return NextResponse.json({
    success: true,
    data: { message: "資格情報を無効化しました。" },
  });
}, { service: 's2s' });
