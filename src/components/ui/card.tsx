import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-white rounded-lg border border-slate-200",
        "shadow-[0_1px_3px_0_rgb(0_0_0/0.07),_0_1px_2px_-1px_rgb(0_0_0/0.05)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-5 py-4 border-b border-slate-100", className)}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // h3 セマンティクス維持・見出し階層の正確さ
    <h3 className={cn("text-sm font-semibold text-slate-800 leading-snug", className)}>
      {children}
    </h3>
  );
}

export function CardContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-5 py-4", className)}>
      {children}
    </div>
  );
}
