/**
 * GET  /api/enterprise/teams  — Enterprise傘下チーム一覧取得
 * POST /api/enterprise/teams  — 傘下チーム新規作成
 *
 * Enterprise admin（is_enterprise_admin = true かつ master ロール）のみ操作可。
 * 傘下組織は parent_organization_id = current_org_id のもの。
 * ADR-018: Enterprise プラン・多チーム組織構造
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getStaffWithRole } from "@/lib/permissions";

function getDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── 認証・権限チェック共通処理 ───────────────────────────────────────────────

async function requireEnterpriseAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 } as const;

  const staff = await getStaffWithRole(user.id);
  if (!staff || staff.role !== "master") {
    return { error: "Forbidden: master role required", status: 403 } as const;
  }

  // Enterprise Admin フラグ確認
  const db = getDb();
  const { data: staffRow } = await db
    .from("staff")
    .select("is_enterprise_admin, org_id")
    .eq("id", staff.id)
    .maybeSingle();

  if (!staffRow?.is_enterprise_admin) {
    return { error: "Forbidden: enterprise admin required", status: 403 } as const;
  }

  // 組織のプランが enterprise であることを確認
  const { data: org } = await db
    .from("organizations")
    .select("id, plan")
    .eq("id", staffRow.org_id)
    .maybeSingle();

  if (!org || org.plan !== "enterprise") {
    return { error: "Forbidden: enterprise plan required", status: 403 } as const;
  }

  return { user, staff, orgId: staffRow.org_id } as const;
}

// ── GET: 傘下チーム一覧 ────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const auth = await requireEnterpriseAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = getDb();

  // 傘下組織を取得（parent_organization_id = orgId）
  const { data: childOrgs, error: childOrgsError } = await db
    .from("organizations")
    .select("id, name, plan, athlete_limit, cv_addon_enabled, created_at")
    .eq("parent_organization_id", auth.orgId)
    .order("created_at", { ascending: true });

  if (childOrgsError) {
    console.error("[enterprise/teams] GET error:", childOrgsError);
    return NextResponse.json({ error: "Failed to fetch child organizations" }, { status: 500 });
  }

  // 各傘下組織のチーム数・選手数を集計
  const orgIds = (childOrgs ?? []).map((o) => o.id).concat(auth.orgId);
  const { data: teams } = await db
    .from("teams")
    .select("id, org_id, name, created_at")
    .in("org_id", orgIds)
    .order("created_at", { ascending: true });

  const { data: athletes } = await db
    .from("athletes")
    .select("id, org_id")
    .in("org_id", orgIds);

  // 組織ごとに集計
  const teamCountByOrg: Record<string, number> = {};
  const athleteCountByOrg: Record<string, number> = {};
  for (const team of teams ?? []) {
    teamCountByOrg[team.org_id] = (teamCountByOrg[team.org_id] ?? 0) + 1;
  }
  for (const athlete of athletes ?? []) {
    athleteCountByOrg[athlete.org_id] = (athleteCountByOrg[athlete.org_id] ?? 0) + 1;
  }

  // 自組織 + 傘下組織を統合して返す
  const { data: parentOrg } = await db
    .from("organizations")
    .select("id, name, plan, athlete_limit, cv_addon_enabled, created_at")
    .eq("id", auth.orgId)
    .maybeSingle();

  const allOrgs = [parentOrg, ...(childOrgs ?? [])].filter(Boolean).map((org) => ({
    ...org,
    team_count: teamCountByOrg[org!.id] ?? 0,
    athlete_count: athleteCountByOrg[org!.id] ?? 0,
    is_parent: org!.id === auth.orgId,
  }));

  return NextResponse.json({ organizations: allOrgs });
}

// ── POST: 傘下組織（チーム）新規作成 ─────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireEnterpriseAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const name: string = body.name?.trim();
  const athleteLimit: number = body.athlete_limit ?? 30;

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "name is required (min 2 chars)" }, { status: 400 });
  }
  if (athleteLimit < 1 || athleteLimit > 200) {
    return NextResponse.json({ error: "athlete_limit must be 1–200" }, { status: 400 });
  }

  // 上限確認: 1親組織につき最大20傘下組織
  const db = getDb();
  const { count } = await db
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .eq("parent_organization_id", auth.orgId);

  if ((count ?? 0) >= 20) {
    return NextResponse.json({ error: "Maximum 20 child organizations per enterprise" }, { status: 422 });
  }

  const { data: newOrg, error: insertError } = await db
    .from("organizations")
    .insert({
      name,
      plan: "pro", // 傘下組織はデフォルト pro（Enterprise 課金は親組織で管理）
      athlete_limit: athleteLimit,
      parent_organization_id: auth.orgId,
      cv_addon_enabled: true, // Enterprise 傘下は CV Addon を継承
    })
    .select("id, name, plan, athlete_limit, cv_addon_enabled, created_at")
    .single();

  if (insertError || !newOrg) {
    console.error("[enterprise/teams] POST error:", insertError);
    return NextResponse.json({ error: "Failed to create child organization" }, { status: 500 });
  }

  return NextResponse.json({ organization: newOrg }, { status: 201 });
}
