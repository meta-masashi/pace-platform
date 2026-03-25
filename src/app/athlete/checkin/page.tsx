"use client";

import { useCallback, useState } from "react";
import { BioSwipeFlow } from "@/components/swipe/bio-swipe-flow";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { SwipeResponsePayload } from "@/types/swipe-assessment";

export default function AthleteCheckinPage() {
  const router = useRouter();
  const [complete, setComplete] = useState(false);

  const handleComplete = useCallback(
    (_responses: SwipeResponsePayload[]) => {
      setComplete(true);
      // Navigate back to athlete home after 2 seconds
      setTimeout(() => router.push("/athlete"), 2000);
    },
    [router]
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <Link
          href="/athlete"
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-sm font-bold text-slate-900">
            モーニング・チェック
          </h1>
          <p className="text-2xs text-slate-500">
            体調報告 — スワイプで回答
          </p>
        </div>
      </header>

      <main className="max-w-[430px] mx-auto px-4 py-8">
        {!complete && (
          <BioSwipeFlow
            athleteId="current-athlete"
            onComplete={handleComplete}
          />
        )}
      </main>
    </div>
  );
}
