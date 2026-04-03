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
import { withApiHandler, ApiError } from "@/lib/api/handler";

// ---------------------------------------------------------------------------
// GET /api/learning/versions
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (_request, _ctx) => {
  const supabase = await createClient();

  // ----- 認証チェック -----
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。");
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
}, { service: 'learning' });

// ---------------------------------------------------------------------------
// POST /api/learning/versions — ロールバック
// ---------------------------------------------------------------------------

interface RollbackRequestBody {
  targetVersion: string;
}

export const POST = withApiHandler(async (request, ctx) => {
  const supabase = await createClient();

  // ----- 認証 & ロールチェック -----
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。");
  }

  const { data: staff } = await supabase
    .from("staff")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!staff || staff.role !== "master") {
    throw new ApiError(403, "master ロールのスタッフのみロールバック可能です。");
  }

  // ----- リクエストボディ -----
  const body = (await request.json()) as RollbackRequestBody;

  if (!body.targetVersion) {
    throw new ApiError(400, "targetVersion が必要です。");
  }

  // ----- ロールバック実行 -----
  try {
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
    ctx.log.error("ロールバックエラー", { detail: err });

    // バージョン未発見エラーは 404
    if (message.includes("見つかりません")) {
      throw new ApiError(404, message);
    }

    throw err;
  }
}, { service: 'learning' });
