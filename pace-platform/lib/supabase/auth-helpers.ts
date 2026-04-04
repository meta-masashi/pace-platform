/**
 * PACE Platform — 認証ヘルパー関数
 *
 * Magic Link、Google OAuth、Email/Password 認証に対応するユーティリティ。
 * クライアントサイドでの認証操作を一元的に管理する。
 */

import type { User } from "@supabase/supabase-js";
import { createClient } from "./client";

// ---------------------------------------------------------------------------
// Supabase クライアント（ブラウザ用 — Cookie ベース SSR 互換）
// ---------------------------------------------------------------------------

function getBrowserClient() {
  return createClient();
}

// ---------------------------------------------------------------------------
// Magic Link 認証
// ---------------------------------------------------------------------------

/**
 * Magic Link をメールアドレスに送信する。
 *
 * ユーザーがメール内のリンクをクリックすると、
 * `/api/auth/callback` に認可コードが返され、セッションが確立される。
 */
export async function signInWithMagicLink(
  email: string,
  loginContext: 'staff' | 'athlete' | 'admin' = 'staff'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getBrowserClient();
    const redirectTo = `${window.location.origin}/api/auth/callback?login_context=${loginContext}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch {
    return { success: false, error: "マジックリンクの送信中にエラーが発生しました。" };
  }
}

// ---------------------------------------------------------------------------
// Google OAuth 認証
// ---------------------------------------------------------------------------

/**
 * Google OAuth フローを開始する。
 *
 * ブラウザを Google のログインページにリダイレクトし、
 * 認証完了後に `/api/auth/callback` に戻る。
 */
export async function signInWithGoogle(
  loginContext: 'staff' | 'athlete' | 'admin' = 'staff'
): Promise<void> {
  const supabase = getBrowserClient();
  const redirectTo = `${window.location.origin}/api/auth/callback?login_context=${loginContext}`;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}

// ---------------------------------------------------------------------------
// Email + Password 認証
// ---------------------------------------------------------------------------

/**
 * メールアドレスとパスワードでサインインする。
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch {
    return { success: false, error: "ログイン中にエラーが発生しました。" };
  }
}

// ---------------------------------------------------------------------------
// サインアウト
// ---------------------------------------------------------------------------

/**
 * 現在のセッションからサインアウトする。
 */
export async function signOut(): Promise<void> {
  const supabase = getBrowserClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }

  window.location.href = "/login";
}

// ---------------------------------------------------------------------------
// ユーザー取得
// ---------------------------------------------------------------------------

/**
 * 現在ログイン中のユーザーを取得する。
 *
 * セッションが存在しない場合は `null` を返す。
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = getBrowserClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ロール取得
// ---------------------------------------------------------------------------

/**
 * 現在ログイン中のユーザーのスタッフロールを取得する。
 *
 * staff テーブルから role カラムを読み取る。
 * スタッフレコードが存在しない場合は `null` を返す（選手など）。
 */
export async function getUserRole(): Promise<
  "master" | "AT" | "PT" | "S&C" | null
> {
  try {
    const supabase = getBrowserClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) return null;

    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("role")
      .eq("id", user.id)
      .single();

    if (staffError || !staff) return null;

    return staff.role as "master" | "AT" | "PT" | "S&C";
  } catch {
    return null;
  }
}
