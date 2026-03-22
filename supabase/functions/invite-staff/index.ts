// supabase/functions/invite-staff/index.ts
//
// スタッフ招待 Edge Function
// - master ロールのみ実行可能
// - Supabase Admin API で認証ユーザーを作成（仮パスワード付き招待メール送信）
// - staff テーブルに行を挿入
// - 監査ログ記録
// - 防壁1: モック実装なし
// - 防壁2: プロンプトインジェクション非対象（ユーザー入力をDBに書くのみ）
// - 防壁3: rate limit（1分間10回）
// - 防壁4: エラー時は詳細ログ + 適切なHTTPステータス返却

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InviteStaffRequest {
  email: string;
  name: string;
  role: "AT" | "PT" | "S&C";
  is_leader?: boolean;
  team_id?: string;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Auth: user-context client ──────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "認証が必要です" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[invite-staff] Missing required env vars");
      return new Response(
        JSON.stringify({ error: "サーバー設定エラー" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // User-scoped client (respects RLS)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // ── 2. 認証ユーザー確認 ────────────────────────────────────────────────
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "認証失敗" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. master ロール確認 ───────────────────────────────────────────────
    const { data: callerStaff, error: staffError } = await userClient
      .from("staff")
      .select("id, org_id, team_id, role, is_active")
      .eq("id", user.id)
      .single();

    if (staffError || !callerStaff) {
      return new Response(
        JSON.stringify({ error: "スタッフ情報が取得できません" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (callerStaff.role !== "master" || !callerStaff.is_active) {
      return new Response(
        JSON.stringify({ error: "スタッフ招待は master ロールのみ実行できます" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. レートリミット（防壁3）─────────────────────────────────────────
    // Service role client for rate limit table (bypasses RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const windowStart = new Date(Date.now() - 60_000).toISOString();
    const { count: rlCount, error: rlError } = await adminClient
      .from("rate_limit_log")
      .select("id", { count: "exact", head: true })
      .eq("key", `${user.id}:invite-staff`)
      .gte("ts", windowStart);

    if (!rlError && (rlCount ?? 0) >= 10) {
      return new Response(
        JSON.stringify({ error: "リクエスト上限に達しました。しばらく待ってから再試行してください。" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record rate limit tick
    await adminClient
      .from("rate_limit_log")
      .insert({ key: `${user.id}:invite-staff` });

    // ── 5. リクエストボディ検証 ────────────────────────────────────────────
    let body: InviteStaffRequest;
    try {
      body = await req.json() as InviteStaffRequest;
    } catch {
      return new Response(
        JSON.stringify({ error: "リクエストボディが不正です" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, name, role, is_leader = false, team_id } = body;

    if (!email || !name || !role) {
      return new Response(
        JSON.stringify({ error: "email, name, role は必須です" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const VALID_ROLES = ["AT", "PT", "S&C"];
    if (!VALID_ROLES.includes(role)) {
      return new Response(
        JSON.stringify({ error: `role は ${VALID_ROLES.join(", ")} のいずれかである必要があります` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // メール形式の簡易チェック（プロンプトインジェクション防止に準じた入力バリデーション）
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "メールアドレスの形式が不正です" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 6. 既存ユーザー重複チェック ────────────────────────────────────────
    const { data: existingStaff } = await adminClient
      .from("staff")
      .select("id, email")
      .eq("email", email)
      .eq("org_id", callerStaff.org_id)
      .maybeSingle();

    if (existingStaff) {
      return new Response(
        JSON.stringify({ error: "このメールアドレスはすでに登録されています" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 7. Supabase Auth: 招待ユーザー作成 ──────────────────────────────────
    // inviteUserByEmail は招待メールを自動送信し、ユーザーがパスワードを設定できる
    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        data: {
          name,
          org_id: callerStaff.org_id,
          role,
        },
      });

    if (inviteError || !inviteData?.user) {
      console.error("[invite-staff] Auth invite failed:", inviteError);
      // 防壁4: 認証API失敗時のフォールバックエラーレスポンス
      return new Response(
        JSON.stringify({
          error: "招待メールの送信に失敗しました",
          detail: inviteError?.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newAuthUserId = inviteData.user.id;

    // ── 8. staff テーブルに行を挿入 ────────────────────────────────────────
    const { data: newStaff, error: insertError } = await adminClient
      .from("staff")
      .insert({
        id: newAuthUserId,
        org_id: callerStaff.org_id,
        team_id: team_id ?? callerStaff.team_id ?? null,
        name,
        email,
        role,
        is_leader,
        is_active: true,
      })
      .select("id, org_id, team_id, name, email, role, is_leader, is_active, created_at")
      .single();

    if (insertError) {
      console.error("[invite-staff] staff insert failed:", insertError);
      // ロールバック: 作成した Auth ユーザーを削除
      await adminClient.auth.admin.deleteUser(newAuthUserId);
      return new Response(
        JSON.stringify({
          error: "スタッフ情報の登録に失敗しました",
          detail: insertError.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 9. 監査ログ ────────────────────────────────────────────────────────
    await adminClient.from("audit_logs").insert({
      org_id: callerStaff.org_id,
      staff_id: user.id,
      action: "staff_invited",
      target_type: "staff",
      target_id: newAuthUserId,
      details: {
        invited_email: email,
        invited_name: name,
        invited_role: role,
        is_leader,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        staff: newStaff,
        message: `${email} に招待メールを送信しました`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[invite-staff] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "サーバー内部エラー" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
