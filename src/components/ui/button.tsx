import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        // ベーススタイル
        "inline-flex items-center justify-center font-medium rounded-md transition-colors",
        // フォーカス可視化（WCAG AA 準拠: 2px outline + offset）
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        // disabled
        "disabled:opacity-50 disabled:cursor-not-allowed",
        // モバイルタッチターゲット最小 44px
        "min-h-[44px] min-w-[44px]",

        // サイズ
        size === "sm" && "h-8 px-3 text-xs min-h-[32px]",   // sm は例外的に 32px
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-base",

        // バリアント
        variant === "primary" && [
          "bg-emerald-600 text-white",
          "hover:bg-emerald-700 active:bg-emerald-800",
          "focus-visible:ring-emerald-500",
          "shadow-sm",
        ],
        variant === "secondary" && [
          "bg-slate-100 text-slate-700",
          "hover:bg-slate-200 active:bg-slate-300",
          "focus-visible:ring-slate-400",
        ],
        variant === "ghost" && [
          "bg-transparent text-slate-600",
          "hover:bg-slate-100 active:bg-slate-200",
          "focus-visible:ring-slate-400",
        ],
        variant === "danger" && [
          "bg-red-600 text-white",
          "hover:bg-red-700 active:bg-red-800",
          "focus-visible:ring-red-500",
          "shadow-sm",
        ],
        variant === "outline" && [
          "border border-slate-300 bg-white text-slate-700",
          "hover:bg-slate-50 active:bg-slate-100",
          "focus-visible:ring-slate-400",
        ],

        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
