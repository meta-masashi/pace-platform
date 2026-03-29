import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Priority } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getPriorityColor(priority: Priority): string {
  switch (priority) {
    case "critical":
      return "text-red-600 bg-red-50 border-red-200";
    case "watchlist":
      return "text-amber-600 bg-amber-50 border-amber-200";
    case "normal":
      return "text-green-600 bg-green-50 border-green-200";
  }
}

export function getPriorityLabel(priority: Priority): string {
  switch (priority) {
    case "critical":
      return "Critical";
    case "watchlist":
      return "Watchlist";
    case "normal":
      return "Normal";
  }
}

export function getACWRColor(acwr: number): string {
  if (acwr > 1.5) return "text-red-600";
  if (acwr > 1.3) return "text-amber-600";
  return "text-green-600";
}

export function getNRSColor(nrs: number): string {
  if (nrs >= 7) return "text-red-600";
  if (nrs >= 4) return "text-amber-600";
  return "text-green-600";
}

export function getHRVColor(hrv: number, baseline = 65): string {
  const ratio = hrv / baseline;
  if (ratio < 0.85) return "text-red-600";
  if (ratio < 0.93) return "text-amber-600";
  return "text-green-600";
}

export function getHPBarColor(hp: number): string {
  if (hp < 50) return "bg-red-500";
  if (hp < 75) return "bg-amber-400";
  return "bg-green-500";
}

/**
 * 日付を短形式で表示する（例: '3月20日'）。
 *
 * UTC の ISO 8601 文字列を Asia/Tokyo タイムゾーンへ変換して表示する。
 * toLocaleDateString() はブラウザ設定に依存するため、
 * Intl.DateTimeFormat に timeZone を明示して使用する。
 */
export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "short",
    day: "numeric",
  }).format(new Date(dateStr));
}

/**
 * 日時を短形式で表示する（例: '3月20日 19:00'）。
 *
 * UTC の ISO 8601 文字列を Asia/Tokyo タイムゾーンへ変換して表示する。
 * toLocaleString() はブラウザ設定に依存するため、
 * Intl.DateTimeFormat に timeZone を明示して使用する。
 */
export function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}
