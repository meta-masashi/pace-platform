"use client";

import { useEffect, useState, useCallback } from "react";
import { TriageSwipe } from "@/components/swipe/triage-swipe";
import type { TriageSwipeCard } from "@/types/swipe-assessment";
import { Check, X, ChevronRight } from "lucide-react";

// ─── タッチデバイス検知 ─────────────────────────────────────────────────────

function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setIsTouch(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isTouch;
}

// ─── PC版: Data War Room (グリッド + インスペクター) ──────────────────────

interface WarRoomProps {
  cards: TriageSwipeCard[];
  onDecision: (
    athleteId: string,
    decision: "APPROVED" | "OVERRIDE_BY_COACH",
    card: TriageSwipeCard
  ) => void;
}

function DataWarRoom({ cards, onDecision }: WarRoomProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    cards[0]?.athlete_id ?? null
  );
  const selected = cards.find((c) => c.athlete_id === selectedId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 h-full">
      {/* 左ペイン: データグリッド */}
      <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            要対応アスリート ({cards.length}名)
          </h3>
          <button
            onClick={() => {
              cards.forEach((c) =>
                onDecision(c.athlete_id, "APPROVED", c)
              );
            }}
            className="text-xs px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium"
          >
            全員一括承認
          </button>
        </div>
        <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
          {cards.map((card) => (
            <div
              key={card.athlete_id}
              onClick={() => setSelectedId(card.athlete_id)}
              className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                selectedId === card.athlete_id ? "bg-slate-50" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-2 h-2 rounded-full ${
                    card.status === "RED" ? "bg-red-500" : "bg-amber-500"
                  }`}
                />
                <span className="text-sm font-medium text-slate-900">
                  {card.athlete_name}
                </span>
                <span className="text-xs text-slate-400">
                  {card.position}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-sm font-bold font-numeric ${
                    card.readiness_score < 40
                      ? "text-red-600"
                      : card.readiness_score < 60
                        ? "text-amber-600"
                        : "text-brand-600"
                  }`}
                >
                  {Math.round(card.readiness_score)}
                </span>
                <div className="flex gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDecision(card.athlete_id, "APPROVED", card);
                    }}
                    className="p-1.5 rounded-md border border-brand-200 text-brand-600 hover:bg-brand-50 transition-colors"
                    title="承認"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDecision(
                        card.athlete_id,
                        "OVERRIDE_BY_COACH",
                        card
                      );
                    }}
                    className="p-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                    title="却下 (Override)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右ペイン: インスペクター */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
        {selected ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {selected.athlete_name}
              </h3>
              <span
                className={`text-xs font-bold px-2 py-1 rounded ${
                  selected.status === "RED"
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {selected.status}
              </span>
            </div>

            {/* Readiness */}
            <div className="mb-4">
              <p className="text-xs text-slate-500 mb-1">Readiness Score</p>
              <div className="flex items-center gap-3">
                <span
                  className={`text-4xl font-bold font-numeric ${
                    selected.readiness_score < 40
                      ? "text-red-600"
                      : selected.readiness_score < 60
                        ? "text-amber-600"
                        : "text-brand-600"
                  }`}
                >
                  {Math.round(selected.readiness_score)}
                </span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      selected.readiness_score < 40
                        ? "bg-red-500"
                        : selected.readiness_score < 60
                          ? "bg-amber-500"
                          : "bg-brand-500"
                    }`}
                    style={{
                      width: `${Math.min(100, selected.readiness_score)}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Risk */}
            <div className="mb-4">
              <p className="text-xs text-slate-500 mb-1">リスクスコア</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      selected.risk_score > 70
                        ? "bg-red-500"
                        : selected.risk_score > 40
                          ? "bg-amber-500"
                          : "bg-brand-500"
                    }`}
                    style={{
                      width: `${Math.min(100, selected.risk_score)}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-numeric font-bold text-slate-700">
                  {selected.risk_score}%
                </span>
              </div>
            </div>

            {/* AI Recommendation */}
            <div className="bg-slate-50 rounded-lg p-4 mb-4">
              <p className="text-xs text-slate-500 font-medium mb-1">
                AI推奨アクション
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">
                {selected.recommendation}
              </p>
            </div>

            {/* Evidence */}
            {selected.evidence_text && (
              <div className="mb-4">
                <p className="text-xs text-slate-500 font-medium mb-1">
                  推論根拠 (Evidence)
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {selected.evidence_text}
                </p>
              </div>
            )}

            {/* Legal disclaimer */}
            <p className="text-2xs text-slate-400 mt-4">
              ※ 判定支援の参考情報です。最終決定は有資格者が行ってください。
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            左のリストからアスリートを選択
          </div>
        )}
      </div>
    </div>
  );
}

// ─── メインコンポーネント: デバイス検知で切替 ────────────────────────────────

interface DeviceAdaptiveTriageProps {
  cards: TriageSwipeCard[];
  onDecision: (
    athleteId: string,
    decision: "APPROVED" | "OVERRIDE_BY_COACH",
    card: TriageSwipeCard
  ) => void;
}

export function DeviceAdaptiveTriage({
  cards,
  onDecision,
}: DeviceAdaptiveTriageProps) {
  const isTouch = useIsTouchDevice();
  const [allProcessed, setAllProcessed] = useState(false);

  const handleDecision = useCallback(
    (
      athleteId: string,
      decision: "APPROVED" | "OVERRIDE_BY_COACH",
      card: TriageSwipeCard
    ) => {
      onDecision(athleteId, decision, card);
    },
    [onDecision]
  );

  if (cards.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-brand-600 font-medium">
          要対応アスリートなし — 全員クリアです
        </p>
      </div>
    );
  }

  // iPad / Touch: Tinder-style swipe
  if (isTouch) {
    return (
      <TriageSwipe
        cards={cards}
        onDecision={handleDecision}
        onAllProcessed={() => setAllProcessed(true)}
      />
    );
  }

  // PC: Data War Room
  return <DataWarRoom cards={cards} onDecision={handleDecision} />;
}
