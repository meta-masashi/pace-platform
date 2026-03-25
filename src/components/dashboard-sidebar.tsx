"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Users,
  UserCircle,
  Target,
  Activity,
  LogOut,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Staff } from "@/types";

// ─── 4 Action Hubs ─────────────────────────────────────────────────────────

const hubs = [
  {
    href: "/dashboard",
    label: "チーム",
    sublabel: "コンディション・トリアージ",
    icon: Users,
    matchPaths: ["/dashboard", "/triage"],
  },
  {
    href: "/players",
    label: "選手",
    sublabel: "データ・アセスメント",
    icon: UserCircle,
    matchPaths: ["/players", "/assessment", "/rehabilitation"],
  },
  {
    href: "/training-plans",
    label: "計画",
    sublabel: "カレンダー・AIサジェスト",
    icon: Target,
    matchPaths: ["/training-plans", "/schedule", "/team-training"],
  },
  {
    href: "/stats",
    label: "Analytics",
    sublabel: "データ分析・レポート",
    icon: Activity,
    matchPaths: ["/stats"],
  },
];

// ─── Touch device detection ────────────────────────────────────────────────

function useIsTouch() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setIsTouch(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isTouch;
}

// ─── Role config ───────────────────────────────────────────────────────────

const roleLabels: Record<string, string> = {
  master: "Master",
  AT: "AT",
  PT: "PT",
  "S&C": "S&C",
};

const roleBadgeColor: Record<string, string> = {
  master: "bg-brand-500 text-white",
  AT: "bg-sky-500 text-white",
  PT: "bg-violet-500 text-white",
  "S&C": "bg-orange-500 text-white",
};

// ─── Component ─────────────────────────────────────────────────────────────

interface DashboardSidebarProps {
  staff: Staff | null;
}

export default function DashboardSidebar({ staff }: DashboardSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isTouch = useIsTouch();
  const [collapsed, setCollapsed] = useState(false);

  // Auto-collapse on touch devices
  useEffect(() => {
    if (isTouch) setCollapsed(true);
  }, [isTouch]);

  async function handleSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Supabase env not set — proceed to login
    }
    router.push("/auth/login");
    router.refresh();
  }

  const displayName = staff?.name ?? "ゲスト";
  const displayInitial = displayName.charAt(0);
  const displayRole = staff
    ? (roleLabels[staff.role] ?? staff.role)
    : "";
  const roleBadge = staff
    ? (roleBadgeColor[staff.role] ?? "bg-slate-500 text-white")
    : "";

  const sidebarWidth = collapsed ? "w-[72px]" : "w-60";

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 h-full flex flex-col z-40 transition-all duration-200 border-r border-slate-200",
        sidebarWidth
      )}
      style={{ backgroundColor: "#ffffff" }}
    >
      {/* ── Logo ─────────────────────────────────────────────────── */}
      <div
        className={cn(
          "border-b border-slate-200 flex items-center",
          collapsed ? "px-3 py-5 justify-center" : "px-5 py-5"
        )}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #FC4C02, #CC4200)",
            }}
            aria-hidden="true"
          >
            <span className="text-white text-sm font-bold leading-none">
              P
            </span>
          </div>
          {!collapsed && (
            <div>
              <span className="text-slate-900 text-base font-bold tracking-tight">
                PACE
              </span>
              <p className="text-slate-400 text-2xs leading-none mt-0.5">
                v6.0
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── 4 Action Hubs ──────────────────────────────────────── */}
      <nav
        className={cn(
          "flex-1 py-6 overflow-y-auto scrollbar-hidden",
          collapsed ? "px-2" : "px-3"
        )}
        aria-label="メインナビゲーション"
      >
        <div className="space-y-2">
          {hubs.map(({ href, label, sublabel, icon: Icon, matchPaths }) => {
            const isActive = matchPaths.some(
              (p) =>
                pathname === p ||
                (p !== "/dashboard" && pathname.startsWith(p))
            );

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "group flex items-center rounded-xl transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 focus-visible:ring-offset-white",
                  collapsed
                    ? "justify-center p-3"
                    : "gap-3.5 px-4 py-3.5",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-black"
                )}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? label : undefined}
              >
                <div
                  className={cn(
                    "flex items-center justify-center rounded-lg flex-shrink-0 transition-colors",
                    collapsed ? "w-10 h-10" : "w-9 h-9",
                    isActive
                      ? "bg-brand-100 text-brand-600"
                      : "bg-slate-100 text-slate-400 group-hover:text-slate-600"
                  )}
                >
                  <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
                </div>
                {!collapsed && (
                  <div className="min-w-0">
                    <span className="text-sm font-semibold block truncate">
                      {label}
                    </span>
                    <span
                      className={cn(
                        "text-2xs block truncate",
                        isActive ? "text-brand-500" : "text-slate-400"
                      )}
                    >
                      {sublabel}
                    </span>
                  </div>
                )}
                {/* Active indicator bar */}
                {isActive && !collapsed && (
                  <div className="ml-auto w-1 h-6 rounded-full bg-brand-500" />
                )}
              </Link>
            );
          })}
        </div>

        {/* ── Divider ── */}
        <div className="my-6 mx-3 border-t border-slate-200" />

        {/* ── Utility links ── */}
        <div className="space-y-1">
          <Link
            href="/community"
            className={cn(
              "flex items-center rounded-lg transition-colors",
              "text-slate-500 hover:bg-slate-50 hover:text-black",
              collapsed ? "justify-center p-3" : "gap-3 px-4 py-2.5"
            )}
            title={collapsed ? "メッセージ" : undefined}
          >
            <MessageSquare
              className="w-4 h-4 flex-shrink-0"
              strokeWidth={1.8}
            />
            {!collapsed && (
              <span className="text-xs font-medium">メッセージ</span>
            )}
          </Link>
          <Link
            href="/settings"
            className={cn(
              "flex items-center rounded-lg transition-colors",
              "text-slate-500 hover:bg-slate-50 hover:text-black",
              collapsed ? "justify-center p-3" : "gap-3 px-4 py-2.5"
            )}
            title={collapsed ? "設定" : undefined}
          >
            <Settings
              className="w-4 h-4 flex-shrink-0"
              strokeWidth={1.8}
            />
            {!collapsed && (
              <span className="text-xs font-medium">設定</span>
            )}
          </Link>
        </div>
      </nav>

      {/* ── User area ──────────────────────────────────────────── */}
      <div className="border-t border-slate-200 px-3 py-4 space-y-3">
        {/* User info */}
        <div
          className={cn(
            "flex items-center",
            collapsed ? "justify-center" : "gap-3 px-2"
          )}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "#FC4C02" }}
            aria-hidden="true"
          >
            <span className="text-white text-xs font-semibold">
              {displayInitial}
            </span>
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 truncate">
                {displayName}
              </p>
              {displayRole && (
                <span
                  className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold leading-none mt-0.5",
                    roleBadge
                  )}
                >
                  {displayRole}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className={cn(
            "flex items-center w-full rounded-lg text-sm font-medium",
            "text-slate-500 hover:bg-red-500/10 hover:text-red-400",
            "transition-colors min-h-[44px]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400",
            collapsed ? "justify-center p-3" : "gap-2.5 px-3 py-2.5"
          )}
          aria-label="ログアウト"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.8} />
          {!collapsed && <span>ログアウト</span>}
        </button>
      </div>

      {/* ── Collapse toggle ── */}
      {!isTouch && (
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute top-1/2 -right-3 w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-black transition-colors shadow-sm"
          aria-label={collapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </aside>
  );
}
