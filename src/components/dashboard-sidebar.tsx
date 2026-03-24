"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  AlertTriangle,
  Users,
  ClipboardList,
  Activity,
  Dumbbell,
  MessageSquare,
  Settings,
  Calendar,
  BarChart2,
  LogOut,
  Video,
  Sparkles,
  Receipt,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Staff } from "@/types";

const navItems = [
  { href: "/dashboard",      label: "ダッシュボード",       icon: LayoutDashboard },
  { href: "/triage",         label: "トリアージ",           icon: AlertTriangle   },
  { href: "/schedule",       label: "スケジュール",         icon: Calendar        },
  { href: "/players",        label: "選手一覧",             icon: Users           },
  { href: "/assessment",     label: "アセスメント",         icon: ClipboardList   },
  { href: "/rehabilitation", label: "リハビリ",             icon: Activity        },
  { href: "/team-training",   label: "チームトレーニング",   icon: Dumbbell        },
  { href: "/telehealth",      label: "TeleHealth",           icon: Video           },
  { href: "/training-plans",  label: "AI訓練計画",           icon: Sparkles        },
  { href: "/billing",         label: "保険請求",             icon: Receipt         },
  { href: "/community",       label: "コミュニティ",         icon: MessageSquare   },
  { href: "/stats",          label: "統計",                 icon: BarChart2       },
  { href: "/settings",       label: "設定",                 icon: Settings        },
];

const roleLabels: Record<string, string> = {
  master: "Master",
  AT:     "AT",
  PT:     "PT",
  "S&C":  "S&C",
};

const roleBadgeColor: Record<string, string> = {
  master: "bg-emerald-500 text-white",
  AT:     "bg-sky-500 text-white",
  PT:     "bg-violet-500 text-white",
  "S&C":  "bg-orange-500 text-white",
};

interface DashboardSidebarProps {
  staff: Staff | null;
}

export default function DashboardSidebar({ staff }: DashboardSidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  const displayName    = staff?.name ?? "ゲスト";
  const displayInitial = displayName.charAt(0);
  const displayRole    = staff ? (roleLabels[staff.role] ?? staff.role) : "";
  const roleBadge      = staff ? (roleBadgeColor[staff.role] ?? "bg-slate-500 text-white") : "";

  return (
    <aside
      className="fixed top-0 left-0 h-full w-60 flex flex-col z-40"
      style={{ backgroundColor: "#0f172a" }} /* slate-900 ダークサイドバー */
    >
      {/* ── ロゴエリア ─────────────────────────────────────────────── */}
      <div className="px-5 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-2.5">
          {/* ブランドアイコン: グリーン正方形にP */}
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
            aria-hidden="true"
          >
            <span className="text-white text-sm font-bold leading-none">P</span>
          </div>
          <div>
            <span className="text-white text-base font-bold tracking-tight">PACE</span>
            <p className="text-slate-400 text-xs leading-none mt-0.5">Platform</p>
          </div>
        </div>
      </div>

      {/* ── ナビゲーション ────────────────────────────────────────────── */}
      <nav
        className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-hidden"
        aria-label="メインナビゲーション"
      >
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                // focus-visible: 明示的なアウトライン（WCAG AA）
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900",
                isActive
                  ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/30"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "w-4 h-4 flex-shrink-0",
                  isActive ? "text-emerald-400" : "text-slate-500"
                )}
                aria-hidden="true"
              />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ── ユーザーエリア ────────────────────────────────────────────── */}
      <div className="px-3 py-4 border-t border-slate-700/50 space-y-3">
        {/* ユーザー情報 */}
        <div className="flex items-center gap-3 px-2">
          {/* アバター */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "#10b981" }}
            aria-hidden="true"
          >
            <span className="text-white text-xs font-semibold">{displayInitial}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-200 truncate">{displayName}</p>
            {displayRole && (
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold leading-none mt-0.5",
                  roleBadge
                )}
                style={{ fontSize: "11px" }}
              >
                {displayRole}
              </span>
            )}
          </div>
        </div>

        {/* サインアウト */}
        <button
          onClick={handleSignOut}
          className={cn(
            "flex items-center gap-2.5 w-full px-3 py-2.5 rounded-md text-sm font-medium",
            "text-slate-400 hover:bg-red-500/15 hover:text-red-400",
            "transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900",
            "min-h-[44px]" // タッチターゲット
          )}
          aria-label="ログアウト"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          ログアウト
        </button>
      </div>
    </aside>
  );
}
