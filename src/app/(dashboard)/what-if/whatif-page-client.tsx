"use client";

import { useState } from "react";
import { WhatIfSimulator } from "@/components/whatif/whatif-simulator";
import { MedicalDisclaimer } from "@/components/ui/medical-disclaimer";

const TISSUE_OPTIONS = [
  { value: "metabolic", label: "代謝系（筋）" },
  { value: "structural_soft", label: "軟部組織（腱・靭帯）" },
  { value: "structural_hard", label: "硬組織（骨）" },
  { value: "neuromotor", label: "神経運動系" },
] as const;

export function WhatIfPageClient() {
  const [selectedTissue, setSelectedTissue] = useState("structural_soft");

  // In production, athleteId comes from route params or selection
  const demoAthleteId = "demo-athlete";
  const demoAthleteName = "選手を選択してください";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          What-If シミュレーション
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          負荷スケールを変更し、組織ストレス蓄積の予測を確認できます
        </p>
      </div>

      <MedicalDisclaimer variant="banner" />

      {/* Tissue Selector */}
      <div className="flex gap-2">
        {TISSUE_OPTIONS.map((t) => (
          <button
            key={t.value}
            onClick={() => setSelectedTissue(t.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              selectedTissue === t.value
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Simulator */}
      <WhatIfSimulator
        athleteId={demoAthleteId}
        athleteName={demoAthleteName}
        baseLoad={100}
        tissue={selectedTissue}
      />
    </div>
  );
}
