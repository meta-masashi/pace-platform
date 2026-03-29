"use client";

import { useState } from "react";
import { ThumbsUp, Edit3, CheckCircle, Loader2, RotateCcw } from "lucide-react";

export type ValidationTarget =
  | "damage_prediction"
  | "recovery_rate"
  | "readiness_score"
  | "injury_risk";

const TARGET_LABELS: Record<ValidationTarget, string> = {
  damage_prediction: "ダメージ予測",
  recovery_rate: "回復速度",
  readiness_score: "レディネススコア",
  injury_risk: "傷害リスク",
};

interface TruthValidationProps {
  athleteId: string;
  target: ValidationTarget;
  predictedValue: number;
  /** 実測値 or コーチが修正した値 */
  actualValue?: number;
  /** 予測を行った日 (ISO string) */
  predictionDate: string;
  onValidated?: (approved: boolean, correctedValue?: number) => void;
}

type ValidationState = "idle" | "correcting" | "submitting" | "done";

export function TruthValidation({
  athleteId,
  target,
  predictedValue,
  predictionDate,
  onValidated,
}: TruthValidationProps) {
  const [state, setState] = useState<ValidationState>("idle");
  const [correctedValue, setCorrectedValue] = useState<string>(
    String(predictedValue)
  );
  const [approved, setApproved] = useState<boolean | null>(null);
  const [recalibrationMsg, setRecalibrationMsg] = useState<string>("");

  const submit = async (isApproved: boolean, corrected?: number) => {
    setState("submitting");
    setApproved(isApproved);

    try {
      const res = await fetch("/api/athlete/truth-validation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId,
          target,
          predictedValue,
          actualValue: corrected ?? predictedValue,
          approved: isApproved,
          predictionDate,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRecalibrationMsg(
          data.recalibration_triggered
            ? `AI再調整中：「${TARGET_LABELS[target]}」モデルを更新しています`
            : `フィードバックを記録しました（${TARGET_LABELS[target]}）`
        );
        setState("done");
        onValidated?.(isApproved, corrected);
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  };

  const handleApprove = () => submit(true);

  const handleCorrect = () => {
    if (state === "correcting") {
      const val = parseFloat(correctedValue);
      if (Number.isFinite(val)) {
        submit(false, val);
      }
    } else {
      setState("correcting");
    }
  };

  const handleReset = () => {
    setState("idle");
    setApproved(null);
    setRecalibrationMsg("");
    setCorrectedValue(String(predictedValue));
  };

  // Done state
  if (state === "done") {
    return (
      <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-green-800 font-medium">答え合わせ完了</p>
          <p className="text-2xs text-green-600 mt-0.5 leading-relaxed">
            {recalibrationMsg}
          </p>
        </div>
        <button
          onClick={handleReset}
          className="text-green-400 hover:text-green-600 transition-colors"
          aria-label="やり直す"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      {/* Target label */}
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <span className="text-2xs font-medium text-slate-500">
          答え合わせ — {TARGET_LABELS[target]}
        </span>
        <span className="text-2xs font-bold font-numeric text-slate-700">
          AI予測: {predictedValue}
        </span>
      </div>

      <div className="px-3 py-3">
        {/* Correction input */}
        {state === "correcting" && (
          <div className="mb-3">
            <label className="text-2xs text-slate-500 mb-1 block">
              実測値を入力してください
            </label>
            <input
              type="number"
              value={correctedValue}
              onChange={(e) => setCorrectedValue(e.target.value)}
              className="w-full h-8 px-2 text-sm font-numeric border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400"
              autoFocus
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleApprove}
            disabled={state === "submitting"}
            className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg
                       bg-green-50 border border-green-200 text-green-700
                       hover:bg-green-100 transition-colors text-xs font-medium
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {state === "submitting" && approved === true ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ThumbsUp className="w-3.5 h-3.5" />
            )}
            正確
          </button>

          <button
            onClick={handleCorrect}
            disabled={state === "submitting"}
            className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg
                        border text-xs font-medium transition-colors
                        disabled:opacity-50 disabled:cursor-not-allowed
                        ${state === "correcting"
                          ? "bg-brand-500 border-brand-500 text-white hover:bg-brand-600"
                          : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                        }`}
          >
            {state === "submitting" && approved === false ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Edit3 className="w-3.5 h-3.5" />
            )}
            {state === "correcting" ? "送信する" : "修正する"}
          </button>
        </div>

        <p className="text-2xs text-slate-400 mt-2 leading-relaxed">
          フィードバックはAIモデルの個体最適化に使用されます
        </p>
      </div>
    </div>
  );
}
