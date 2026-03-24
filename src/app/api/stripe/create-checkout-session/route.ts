/**
 * POST /api/stripe/create-checkout-session
 *
 * Body:
 *   { plan: "pro" | "standard" | "enterprise" }   — プラン変更
 *   { addon: "cv_addon" }                          — CV解析アドオン購入
 *
 * - 認証済みスタッフ（master ロールのみ）が課金セッションを作成
 * - client_reference_id = org_id（Webhook で組織特定に使用）
 * - success_url / cancel_url を返す
 * - Phase 4: enterprise / cv_addon に対応（ADR-017, ADR-018）
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStaffWithRole, hasPermission } from "@/lib/permissions";
import { getStripe, getPlanPriceId, getCvAddonPriceId } from "@/lib/stripe";

const VALID_PLANS = ["pro", "standard", "enterprise"] as const;
type PlanType = typeof VALID_PLANS[number];

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Permission: org:admin のみ課金操作可 ───────────────────────────────────
  const staff = await getStaffWithRole(user.id);
  if (!staff || !hasPermission(staff.role, "org:admin")) {
    return NextResponse.json({ error: "Forbidden: org:admin required" }, { status: 403 });
  }

  // ── Body ─────────────────────────────────────────────────────────────────
  const body = await request.json();
  const addon: string | undefined = body.addon;
  const plan: string | undefined = body.plan;

  if (!addon && !plan) {
    return NextResponse.json({ error: 'Provide either "plan" or "addon"' }, { status: 400 });
  }
  if (plan && !VALID_PLANS.includes(plan as PlanType)) {
    return NextResponse.json({ error: `plan must be one of: ${VALID_PLANS.join(", ")}` }, { status: 400 });
  }
  if (addon && addon !== "cv_addon") {
    return NextResponse.json({ error: 'addon must be "cv_addon"' }, { status: 400 });
  }

  // ── Org の情報を取得 ─────────────────────────────────────────────────────
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, stripe_customer_id, cv_addon_enabled, plan")
    .eq("id", staff.org_id)
    .single();

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  // CV Addon はすでに有効な場合は弾く
  if (addon === "cv_addon" && org.cv_addon_enabled) {
    return NextResponse.json({ error: "CV Addon is already active" }, { status: 409 });
  }

  try {
    const stripe = getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://hachi-riskon.com";

    const isCvAddon = addon === "cv_addon";
    const priceId = isCvAddon
      ? getCvAddonPriceId()
      : getPlanPriceId(plan as PlanType);

    // 既存の stripe customer を再利用（重複顧客作成防止）
    const customerParam = org.stripe_customer_id
      ? { customer: org.stripe_customer_id }
      : {
          customer_email: user.email,
          customer_creation: "always" as const,
        };

    const metadata: Record<string, string> = { org_id: org.id };
    if (isCvAddon) {
      metadata.addon_type = "cv_addon";
    } else {
      metadata.plan = plan as string;
    }

    const successPath = isCvAddon
      ? "/settings?billing=cv_addon_activated"
      : "/settings?billing=success";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      ...customerParam,
      client_reference_id: org.id,
      metadata,
      success_url: `${appUrl}${successPath}`,
      cancel_url: `${appUrl}/settings?billing=cancelled`,
      allow_promotion_codes: true,
      subscription_data: { metadata },
    });

    return NextResponse.json({ url: session.url, session_id: session.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe/create-checkout-session]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
