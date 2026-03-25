/**
 * PACE Platform — 管理ダッシュボード（master 限定）
 *
 * 組織情報、クイック統計（スタッフ数・選手数・アクティブアセスメント数）を表示。
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // スタッフ情報取得（master チェック）
  const { data: staff } = await supabase
    .from("staff")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single();

  if (!staff || staff.role !== "master") {
    redirect("/dashboard");
  }

  // 組織情報
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, plan, created_at")
    .eq("id", staff.org_id)
    .single();

  // サブスクリプション情報
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status, current_period_end")
    .eq("org_id", staff.org_id)
    .maybeSingle();

  // 統計データ取得
  const [staffResult, athleteResult, assessmentResult] = await Promise.all([
    supabase
      .from("staff")
      .select("id", { count: "exact", head: true })
      .eq("org_id", staff.org_id)
      .eq("is_active", true),
    supabase
      .from("athletes")
      .select("id", { count: "exact", head: true })
      .eq("org_id", staff.org_id),
    supabase
      .from("assessments")
      .select("id", { count: "exact", head: true })
      .eq("org_id", staff.org_id)
      .eq("status", "in_progress"),
  ]);

  const totalStaff = staffResult.count ?? 0;
  const totalAthletes = athleteResult.count ?? 0;
  const activeAssessments = assessmentResult.count ?? 0;

  const planLabel: Record<string, string> = {
    starter: "Starter",
    pro: "Pro",
    enterprise: "Enterprise",
    standard: "Standard",
  };

  const statusLabel: Record<string, string> = {
    active: "有効",
    trialing: "トライアル中",
    past_due: "支払い遅延",
    read_only: "読み取り専用",
    canceled: "解約済み",
    unpaid: "未払い",
    inactive: "未契約",
  };

  const statusColor: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    trialing: "bg-blue-100 text-blue-800",
    past_due: "bg-yellow-100 text-yellow-800",
    read_only: "bg-orange-100 text-orange-800",
    canceled: "bg-gray-100 text-gray-600",
    unpaid: "bg-red-100 text-red-800",
    inactive: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">管理ダッシュボード</h1>
        <p className="text-sm text-muted-foreground">
          組織の概要とクイック統計
        </p>
      </div>

      {/* 組織情報カード */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">組織情報</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">組織名</p>
            <p className="text-lg font-medium">{org?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">プラン</p>
            <p className="text-lg font-medium">
              {planLabel[subscription?.plan ?? org?.plan ?? "standard"] ?? "Standard"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">ステータス</p>
            <span
              className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${
                statusColor[subscription?.status ?? "inactive"] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {statusLabel[subscription?.status ?? "inactive"] ?? "未契約"}
            </span>
          </div>
        </div>
        {subscription?.current_period_end && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              次回請求日:{" "}
              <span className="font-medium text-foreground">
                {new Date(subscription.current_period_end).toLocaleDateString("ja-JP")}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* クイック統計 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="アクティブスタッフ" value={totalStaff} href="/admin/staff" />
        <StatCard label="登録選手数" value={totalAthletes} href="/athletes" />
        <StatCard label="進行中アセスメント" value={activeAssessments} href="/assessment" />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/30 hover:bg-accent/50"
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground group-hover:text-primary">
        詳細を見る →
      </p>
    </a>
  );
}
