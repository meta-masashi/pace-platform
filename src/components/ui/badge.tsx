import { cn } from "@/lib/utils";

interface BadgeProps {
  variant: "critical" | "watchlist" | "normal" | "default";
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
        variant === "critical" && "text-red-700 bg-red-50 border-red-200",
        variant === "watchlist" && "text-amber-700 bg-amber-50 border-amber-200",
        variant === "normal" && "text-green-700 bg-green-50 border-green-200",
        variant === "default" && "text-gray-700 bg-gray-100 border-gray-200",
        className
      )}
    >
      {children}
    </span>
  );
}
