import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockAthletes } from "@/lib/mock-data";

export default function AssessmentIndexPage() {
  const atRisk = mockAthletes.filter((a) => a.status !== "normal");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">アセスメント</h1>
      <p className="text-sm text-gray-500">アセスメントを開始する選手を選択してください</p>

      <div className="grid grid-cols-1 gap-3 max-w-xl">
        {atRisk.map((athlete) => (
          <Link key={athlete.id} href={`/assessment/${athlete.id}`}>
            <Card className="hover:border-green-200 hover:shadow-md transition-all cursor-pointer">
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                    <span className="text-green-700 text-xs font-bold">
                      {athlete.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{athlete.name}</p>
                    <p className="text-xs text-gray-500">{athlete.position} / #{athlete.number}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={athlete.status}>
                    {athlete.status === "critical" ? "Critical" : "Watchlist"}
                  </Badge>
                  <ClipboardList className="w-4 h-4 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
