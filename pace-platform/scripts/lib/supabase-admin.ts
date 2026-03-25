/**
 * PACE Platform -- スクリプト用 Supabase 管理クライアント
 *
 * Service Role Key を使用して RLS をバイパスする管理クライアント。
 * インポートスクリプトなど CLI ツールから使用する。
 *
 * 環境変数は .env.local またはプロセス環境変数から読み込む。
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// .env.local 読み込み
// ---------------------------------------------------------------------------

function loadEnvFile(): void {
  // pace-platform ディレクトリ、またはリポジトリルートの .env.local を探す
  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "..", ".env.local"),
  ];

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");

      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();

        // コメント行・空行をスキップ
        if (trimmed === "" || trimmed.startsWith("#")) {
          continue;
        }

        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) continue;

        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();

        // クォート除去
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        // 既存の環境変数を上書きしない
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }

      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Supabase 管理クライアント
// ---------------------------------------------------------------------------

let adminClient: SupabaseClient | null = null;

/**
 * Service Role Key を使用した Supabase 管理クライアントを返す。
 * シングルトンパターンで再利用する。
 *
 * 必要な環境変数:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) {
    return adminClient;
  }

  // .env.local から環境変数を読み込み
  loadEnvFile();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "環境変数 NEXT_PUBLIC_SUPABASE_URL が設定されていません。\n" +
      ".env.local ファイルを確認するか、環境変数を設定してください。",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "環境変数 SUPABASE_SERVICE_ROLE_KEY が設定されていません。\n" +
      ".env.local ファイルを確認するか、環境変数を設定してください。",
    );
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}
