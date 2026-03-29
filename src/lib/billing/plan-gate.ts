/**
 * プラン別アクセス権チェック（Plan Gate）
 *
 * PACE Platform では組織（org）単位でサブスクリプションを管理する。
 * 各機能フラグは "feature:xxx" 形式で表現し、
 * requirePlan() をAPIルートのガードとして使用する。
 *
 * 【防壁3】コスト保護: 上位プランの機能を下位プランが利用できないようブロック
 * 【防壁1】モック実装の排除: Supabase の subscriptions / organizations テーブルを実際に参照
 *
 * 使用例（APIルート）:
 *   await requirePlan(supabase, orgId, 'feature:ai')
 *   // → pro / enterprise でなければ 402 エラーを throw
 *
 * 使用例（組織プランを取得）:
 *   const plan = await getOrgPlan(supabase, orgId)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// プランの種類
// ---------------------------------------------------------------------------

export type PlanTier = "starter" | "pro" | "enterprise";

// ---------------------------------------------------------------------------
// フィーチャーフラグとプランのマッピング
// ---------------------------------------------------------------------------

/**
 * 各機能フラグが利用可能なプランを定義する。
 * ここに記載されていない機能は全プランで利用可能とみなす。
 */
export const PLAN_PERMISSIONS: Record<PlanTier, string[]> = {
  starter: [
    "feature:basic",          // 基本機能（アセスメント閲覧・SOAP閲覧）
    "feature:triage",         // トリアージ
    "feature:schedule",       // スケジュール管理
  ],
  pro: [
    "feature:basic",
    "feature:triage",
    "feature:schedule",
    "feature:ai",             // AI診断支援（Gemini連携）
    "feature:rehab",          // リハビリプログラム管理
    "feature:training_plan",  // トレーニング計画
    "feature:analytics",      // 分析ダッシュボード
    "feature:export",         // データエクスポート
  ],
  enterprise: [
    "feature:basic",
    "feature:triage",
    "feature:schedule",
    "feature:ai",
    "feature:rehab",
    "feature:training_plan",
    "feature:analytics",
    "feature:export",
    "feature:cv_addon",       // コンピュータビジョン解析（Enterprise は込み）
    "feature:multi_team",     // マルチチーム管理
    "feature:billing_claims", // 保険請求連携（ADR-031）
    "feature:imu",            // IMUセンサー連携（ADR-030）
    "feature:enterprise",     // Enterprise 専用機能
  ],
};

// ---------------------------------------------------------------------------
// エラークラス
// ---------------------------------------------------------------------------

export class PlanGateError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 402 | 403,
    public readonly requiredPlan?: PlanTier
  ) {
    super(message);
    this.name = "PlanGateError";
  }
}

// ---------------------------------------------------------------------------
// 組織のプラン取得
// ---------------------------------------------------------------------------

/**
 * 組織の現在のプランを取得する。
 * subscriptions テーブルの status = 'active' | 'trialing' を優先して返す。
 * 有効なサブスクリプションがない場合は organizations.plan を返す。
 *
 * @param supabase  Supabase クライアント（service role または認証済みクライアント）
 * @param orgId     組織 ID
 * @returns         プランティア（未契約の場合は 'starter'）
 */
export async function getOrgPlan(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ plan: PlanTier; status: string }> {
  // subscriptions テーブルからアクティブなサブスクリプションを検索
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("org_id", orgId)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sub) {
    return { plan: (sub.plan as PlanTier) ?? "starter", status: sub.status };
  }

  // フォールバック: organizations テーブルの plan カラムを参照
  const { data: org } = await supabase
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .maybeSingle();

  return {
    plan: (org?.plan as PlanTier) ?? "starter",
    status: "inactive",
  };
}

// ---------------------------------------------------------------------------
// プラン別アクセス権チェック
// ---------------------------------------------------------------------------

/**
 * 組織が指定された機能フラグを利用可能かチェックする。
 * 利用できない場合は PlanGateError を throw する。
 *
 * @param supabase        Supabase クライアント
 * @param orgId           組織 ID
 * @param requiredFeature 必要な機能フラグ（例: 'feature:ai'）
 * @throws PlanGateError  プランが不足している場合 (statusCode: 402)
 * @throws PlanGateError  サブスクリプションが無効な場合 (statusCode: 403)
 */
export async function requirePlan(
  supabase: SupabaseClient,
  orgId: string,
  requiredFeature: string
): Promise<void> {
  const { plan, status } = await getOrgPlan(supabase, orgId);

  // read_only / past_due はアクセスを制限（機能によっては拒否）
  if (status === "canceled" || status === "unpaid") {
    throw new PlanGateError(
      "サブスクリプションが無効です。プランをご確認ください。",
      403
    );
  }

  const allowedFeatures = PLAN_PERMISSIONS[plan] ?? PLAN_PERMISSIONS.starter;

  if (!allowedFeatures.includes(requiredFeature)) {
    // 必要なプランを特定する
    const requiredPlan = (["starter", "pro", "enterprise"] as PlanTier[]).find(
      (tier) => PLAN_PERMISSIONS[tier].includes(requiredFeature)
    );

    throw new PlanGateError(
      `この機能（${requiredFeature}）は現在のプラン（${plan}）では利用できません。` +
        (requiredPlan ? `${requiredPlan} プラン以上が必要です。` : ""),
      402,
      requiredPlan
    );
  }
}

// ---------------------------------------------------------------------------
// 機能フラグの参照可否確認（throw しない版）
// ---------------------------------------------------------------------------

/**
 * 組織が指定された機能フラグを利用可能かどうかを boolean で返す。
 * UI の条件分岐など、エラーを投げたくない場面で使用する。
 *
 * @param supabase        Supabase クライアント
 * @param orgId           組織 ID
 * @param requiredFeature 必要な機能フラグ（例: 'feature:ai'）
 * @returns               { allowed: boolean; plan: PlanTier; status: string }
 */
export async function canUsePlan(
  supabase: SupabaseClient,
  orgId: string,
  requiredFeature: string
): Promise<{ allowed: boolean; plan: PlanTier; status: string }> {
  const { plan, status } = await getOrgPlan(supabase, orgId);

  if (status === "canceled" || status === "unpaid") {
    return { allowed: false, plan, status };
  }

  const allowedFeatures = PLAN_PERMISSIONS[plan] ?? PLAN_PERMISSIONS.starter;
  return {
    allowed: allowedFeatures.includes(requiredFeature),
    plan,
    status,
  };
}
