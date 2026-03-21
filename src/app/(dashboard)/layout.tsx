"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mockStaff } from "@/lib/mock-data";

const navItems = [
  { href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/triage", label: "トリアージ", icon: AlertTriangle },
  { href: "/schedule", label: "スケジュール", icon: Calendar },
  { href: "/players", label: "選手一覧", icon: Users },
  { href: "/assessment", label: "アセスメント", icon: ClipboardList },
  { href: "/rehabilitation", label: "リハビリ", icon: Activity },
  { href: "/team-training", label: "チームトレーニング", icon: Dumbbell },
  { href: "/community", label: "コミュニティ", icon: MessageSquare },
  { href: "/stats", label: "統計", icon: BarChart2 },
  { href: "/settings", label: "設定", icon: Settings },
];

const roleLabels: Record<string, string> = {
  master: "マスター",
  AT: "AT",
  PT: "PT",
  "S&C": "S&C",
};

const currentStaff = mockStaff[0];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="fixed top-0 left-0 h-full w-60 bg-white border-r border-gray-200 flex flex-col z-40">
        <div className="px-4 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-green-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">P</span>
            </div>
            <span className="text-lg font-bold text-gray-900">PACE</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Platform</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-green-50 text-green-700 border border-green-100"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <Icon className={cn("w-4 h-4", isActive ? "text-green-600" : "text-gray-400")} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <span className="text-green-700 text-xs font-semibold">
                {currentStaff.name.charAt(0)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{currentStaff.name}</p>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                {roleLabels[currentStaff.role] ?? currentStaff.role}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <main className="ml-60 flex-1 p-6 min-h-screen">{children}</main>
    </div>
  );
}
