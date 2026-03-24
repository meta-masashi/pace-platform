/**
 * CV解析アドオンのアクセスゲート（ADR-017）
 *
 * CV関連APIルート（/api/cv/*）で呼び出し、
 * cv_addon_enabled フラグと月次使用量を確認する。
 *
 * Enterprise プランは常に許可（cv_addon_enabled = true が保証される）。
 *
 * 使用例:
 *   const gate = await checkCvAddonGate(orgId)
 *   if (!gate.allowed) return NextResponse.json({ error: gate.reason }, { status: gate.status })
 */

import { createClient as createServiceClient } from "@supabase/supabase-js";

interface GateResult {
  allowed: boolean;
  reason?: string;
  status?: number;
  usage?: { count: number; limit: number };
}

function getDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * 組織が CV解析アドオンを利用可能かチェックする。
 * consumeUsage = true の場合、使用量を +1 インクリメント（解析リクエスト時のみ）。
 */
export async function checkCvAddonGate(
  orgId: string,
  consumeUsage = false
): Promise<GateResult> {
  const db = getDb();

  // ① CV Addon 有効フラグを確認
  const { data: org, error: orgError } = await db
    .from("organizations")
    .select("cv_addon_enabled, cv_addon_monthly_limit, plan")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError || !org) {
    return { allowed: false, reason: "Organization not found", status: 404 };
  }

  if (!org.cv_addon_enabled) {
    return {
      allowed: false,
      reason: "CV_ADDON_DISABLED: CV解析アドオンが有効ではありません。設定ページからアドオンを購入してください。",
      status: 402,
    };
  }

  // ② 月次使用量を確認
  const usageMonth = new Date();
  usageMonth.setDate(1);
  const usageMonthStr = usageMonth.toISOString().slice(0, 10); // YYYY-MM-01

  const { data: usage } = await db
    .from("cv_analysis_usage")
    .select("analysis_count, limit_count")
    .eq("org_id", orgId)
    .eq("usage_month", usageMonthStr)
    .maybeSingle();

  const currentCount = usage?.analysis_count ?? 0;
  const limitCount = usage?.limit_count ?? org.cv_addon_monthly_limit ?? 50;

  if (consumeUsage && currentCount >= limitCount) {
    return {
      allowed: false,
      reason: `CV_ADDON_LIMIT_EXCEEDED: 月次上限（${limitCount}本）に達しました。`,
      status: 429,
      usage: { count: currentCount, limit: limitCount },
    };
  }

  // ③ 使用量をインクリメント（消費フラグが true の場合のみ）
  if (consumeUsage) {
    await db.from("cv_analysis_usage").upsert(
      {
        org_id: orgId,
        usage_month: usageMonthStr,
        analysis_count: currentCount + 1,
        limit_count: limitCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,usage_month" }
    );
  }

  return {
    allowed: true,
    usage: { count: consumeUsage ? currentCount + 1 : currentCount, limit: limitCount },
  };
}
