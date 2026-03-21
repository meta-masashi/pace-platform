import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}

export function Button({ variant = "primary", size = "md", className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" && "px-2.5 py-1 text-xs",
        size === "md" && "px-3 py-1.5 text-sm",
        size === "lg" && "px-4 py-2 text-base",
        variant === "primary" && "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500",
        variant === "secondary" && "bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
        variant === "outline" && "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-gray-400",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
