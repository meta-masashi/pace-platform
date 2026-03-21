import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "stable";
  trendLabel?: string;
  color?: "default" | "red" | "amber" | "green" | "blue";
  subtitle?: string;
}

export function KpiCard({ title, value, unit, trend, trendLabel, color = "default", subtitle }: KpiCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
      <div className="mt-2 flex items-baseline gap-1">
        <span
          className={cn(
            "text-2xl font-bold",
            color === "red" && "text-red-600",
            color === "amber" && "text-amber-600",
            color === "green" && "text-green-600",
            color === "blue" && "text-blue-600",
            color === "default" && "text-gray-900"
          )}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-gray-500">{unit}</span>}
      </div>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      {(trend || trendLabel) && (
        <div className="mt-2 flex items-center gap-1">
          {trend === "up" && <TrendingUp className="w-3 h-3 text-green-500" />}
          {trend === "down" && <TrendingDown className="w-3 h-3 text-red-500" />}
          {trend === "stable" && <Minus className="w-3 h-3 text-gray-400" />}
          {trendLabel && <span className="text-xs text-gray-500">{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}
