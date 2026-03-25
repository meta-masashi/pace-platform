/**
 * PACE Platform — モデルバージョン管理 API
 *
 * GET  /api/learning/versions — モデルバージョン一覧
 * POST /api/learning/versions — 指定バージョンにロールバック（master のみ）
 *
 * DAG ノード LR 値のバージョン管理とロールバック機能を提供する。
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listVersions, rollbackToVersion } from "@/lib/learning/version-manager";

// ---------------------------------------------------------------------------
// GET /api/learning/versions
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient();

    // ----- 認証チェック -----
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "認証が必要です。" },
        { status: 401 }
      );
    }

    // ----- バージョン一覧を取得 -----
    const versions = await listVersions(supabase);

    return NextResponse.json({
      success: true,
      data: {
        versions: versions.map((v) => ({
          version: v.version,
          source: v.source,
          createdAt: v.createdAt.toISOString(),
          approvedBy: v.approvedBy,
          notes: v.notes,
        })),
      },
    });
  } catch (err) {
    console.error("[learning:versions] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/learning/versions — ロールバック
// ---------------------------------------------------------------------------

interface RollbackRequestBody {
  targetVersion: string;
}

export async function POST(
  request: Request
): Promise<NextResponse> {
  try {
    const supabase = await createClient();

    // ----- 認証 & ロールチェック -----
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "認証が必要です。" },
        { status: 401 }
      );
    }

    const { data: staff } = await supabase
      .from("staff")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!staff || staff.role !== "master") {
      return NextResponse.json(
        { success: false, error: "master ロールのスタッフのみロールバック可能です。" },
        { status: 403 }
      );
    }

    // ----- リクエストボディ -----
    const body = (await request.json()) as RollbackRequestBody;

    if (!body.targetVersion) {
      return NextResponse.json(
        { success: false, error: "targetVersion が必要です。" },
        { status: 400 }
      );
    }

    // ----- ロールバック実行 -----
    const nodesRestored = await rollbackToVersion(
      supabase,
      body.targetVersion,
      user.id
    );

    return NextResponse.json({
      success: true,
      data: {
        rolledBackTo: body.targetVersion,
        nodesRestored,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    console.error("[learning:versions] ロールバックエラー:", err);

    // バージョン未発見エラーは 404
    if (message.includes("見つかりません")) {
      return NextResponse.json(
        { success: false, error: message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}
