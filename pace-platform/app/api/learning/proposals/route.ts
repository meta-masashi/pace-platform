/**
 * PACE Platform — LR 更新提案 API
 *
 * GET  /api/learning/proposals — 保留中の LR 更新提案一覧（master のみ）
 * PATCH /api/learning/proposals — 提案を承認または却下（master のみ）
 *
 * 安全バウンド（±50%）を超えた LR 更新は自動適用されず、
 * このエンドポイント経由で master ロールのスタッフが手動レビューする。
 *
 * 承認時:
 *   - assessment_nodes.lr_yes_sr を更新
 *   - モデルバージョンスナップショットを保存
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveModelVersion, getLatestVersion } from "@/lib/learning/version-manager";
import { withApiHandler, ApiError } from "@/lib/api/handler";


// ---------------------------------------------------------------------------
// GET /api/learning/proposals
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (request, ctx) => {
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
    throw new ApiError(403, "master ロールのスタッフのみアクセス可能です。");
  }

  // ----- クエリパラメータ -----
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pending";

  // ----- 提案を取得 -----
  const { data: proposals, error: fetchError } = await supabase
    .from("lr_update_proposals")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (fetchError) {
    ctx.log.error("取得エラー", { detail: fetchError });
    throw new ApiError(500, "提案の取得に失敗しました。");
  }

  const items = (proposals ?? []).map((p: Record<string, unknown>) => ({
    id: p.id as string,
    nodeId: p.node_id as string,
    currentLR: p.current_lr as number,
    proposedLR: p.proposed_lr as number,
    originalCsvLR: p.original_csv_lr as number,
    deviationPct: p.deviation_pct as number,
    sampleSize: p.sample_size as number,
    confidence: p.confidence as number,
    status: p.status as "pending" | "approved" | "rejected",
    reviewedBy: (p.reviewed_by as string) ?? undefined,
    reviewedAt: p.reviewed_at ? new Date(p.reviewed_at as string) : undefined,
    batchVersion: p.batch_version as string,
    createdAt: new Date(p.created_at as string),
  }));

  return NextResponse.json({
    success: true,
    data: {
      proposals: items,
      totalCount: items.length,
    },
  });
}, { service: 'learning' });

// ---------------------------------------------------------------------------
// PATCH /api/learning/proposals
// ---------------------------------------------------------------------------

interface PatchRequestBody {
  proposalId: string;
  action: "approved" | "rejected";
}

export const PATCH = withApiHandler(async (request, ctx) => {
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
    throw new ApiError(403, "master ロールのスタッフのみアクセス可能です。");
  }

  // ----- リクエストボディ -----
  const body = (await request.json()) as PatchRequestBody;

  if (!body.proposalId || !["approved", "rejected"].includes(body.action)) {
    throw new ApiError(400, "proposalId と action ('approved' | 'rejected') が必要です。");
  }

  // ----- 提案を取得 -----
  const { data: proposal, error: fetchError } = await supabase
    .from("lr_update_proposals")
    .select("*")
    .eq("id", body.proposalId)
    .single();

  if (fetchError || !proposal) {
    throw new ApiError(404, "指定された提案が見つかりません。");
  }

  if ((proposal.status as string) !== "pending") {
    throw new ApiError(409, "この提案は既にレビュー済みです。");
  }

  // ----- 提案を更新 -----
  const { error: updateError } = await supabase
    .from("lr_update_proposals")
    .update({
      status: body.action,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", body.proposalId);

  if (updateError) {
    ctx.log.error("更新エラー", { detail: updateError });
    throw new ApiError(500, "提案の更新に失敗しました。");
  }

  let modelVersionCreated: string | undefined;

  // ----- 承認時: LR を更新 & モデルバージョン保存 -----
  if (body.action === "approved") {
    const nodeId = proposal.node_id as string;
    const proposedLR = proposal.proposed_lr as number;

    // assessment_nodes を更新
    const { error: nodeUpdateError } = await supabase
      .from("assessment_nodes")
      .update({ lr_yes_sr: proposedLR })
      .eq("node_id", nodeId);

    if (nodeUpdateError) {
      ctx.log.error(`ノード更新失敗 ${nodeId}`, { detail: nodeUpdateError });
    }

    // モデルバージョンを保存
    const latestVersion = await getLatestVersion(supabase);
    const versionMatch = latestVersion?.version?.match(/^v(\d+)\.(\d+)/);
    const nextVersion =
      versionMatch && versionMatch[1] && versionMatch[2]
        ? `v${versionMatch[1]}.${parseInt(versionMatch[2], 10) + 1}`
        : "v1.1";

    const weights = latestVersion?.nodeWeights ?? new Map<string, number>();
    weights.set(nodeId, proposedLR);

    await saveModelVersion(supabase, {
      version: nextVersion,
      createdAt: new Date(),
      nodeWeights: weights,
      source: "manual_override",
      approvedBy: user.id,
      notes: `手動承認: ノード ${nodeId} の LR を ${proposedLR.toFixed(3)} に更新`,
    });

    modelVersionCreated = nextVersion;
  }

  return NextResponse.json({
    success: true,
    data: {
      proposal: {
        id: proposal.id as string,
        nodeId: proposal.node_id as string,
        currentLR: proposal.current_lr as number,
        proposedLR: proposal.proposed_lr as number,
        originalCsvLR: proposal.original_csv_lr as number,
        deviationPct: proposal.deviation_pct as number,
        sampleSize: proposal.sample_size as number,
        confidence: proposal.confidence as number,
        status: body.action,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        batchVersion: proposal.batch_version as string,
        createdAt: new Date(proposal.created_at as string),
      },
      modelVersionCreated,
    },
  });
}, { service: 'learning' });
