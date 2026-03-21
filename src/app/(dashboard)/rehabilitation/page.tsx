import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { mockRehabPrograms, mockAthletes } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import type { RehabPhase } from "@/types";

const phaseColors: Record<RehabPhase, string> = {
  1: "text-red-700 bg-red-50 border-red-200",
  2: "text-amber-700 bg-amber-50 border-amber-200",
  3: "text-blue-700 bg-blue-50 border-blue-200",
  4: "text-green-700 bg-green-50 border-green-200",
};

const statusLabel = {
  active: "進行中",
  completed: "完了",
  on_hold: "保留中",
} as const;

export default function RehabilitationPage() {
  const active = mockRehabPrograms.filter((p) => p.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">リハビリ管理</h1>
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2">
          <span className="text-blue-700 font-semibold">{active}</span>
          <span className="text-blue-600 text-sm ml-1">件 アクティブプログラム</span>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">選手名</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">傷害名</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">現フェーズ</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">経過日数</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">RTP予定日</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ステータス</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">アクション</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mockRehabPrograms.map((program) => {
                const athlete = mockAthletes.find((a) => a.id === program.athlete_id);
                const startDate = new Date(program.start_date);
                const elapsed = Math.floor(
                  (new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
                );
                return (
                  <tr key={program.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {athlete?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{program.diagnosis_label}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
                          phaseColors[program.current_phase]
                        )}
                      >
                        Phase {program.current_phase}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{elapsed}日</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(program.estimated_rtp_date).toLocaleDateString("ja-JP", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          program.status === "active"
                            ? "watchlist"
                            : program.status === "completed"
                            ? "normal"
                            : "default"
                        }
                      >
                        {statusLabel[program.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/rehabilitation/${program.id}`}
                        className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
