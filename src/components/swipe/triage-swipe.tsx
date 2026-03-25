"use client";

import { useCallback, useState } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  AnimatePresence,
  type PanInfo,
} from "framer-motion";
import {
  Check,
  X,
  AlertTriangle,
  Shield,
  ChevronRight,
} from "lucide-react";
import type { TriageSwipeCard } from "@/types/swipe-assessment";

const SWIPE_THRESHOLD = 120;

interface TriageSwipeProps {
  cards: TriageSwipeCard[];
  onDecision: (
    athleteId: string,
    decision: "APPROVED" | "OVERRIDE_BY_COACH",
    card: TriageSwipeCard
  ) => void;
  onAllProcessed: () => void;
}

function TriageCardContent({ card }: { card: TriageSwipeCard }) {
  const isRed = card.status === "RED";

  return (
    <div className="h-full flex flex-col">
      {/* Status header */}
      <div
        className={`px-5 py-3 flex items-center gap-2 ${
          isRed ? "bg-red-50" : "bg-amber-50"
        }`}
      >
        <AlertTriangle
          className={`w-4 h-4 ${isRed ? "text-red-600" : "text-amber-600"}`}
        />
        <span
          className={`text-xs font-bold ${isRed ? "text-red-700" : "text-amber-700"}`}
        >
          {isRed ? "CRITICAL — 即時対応" : "ORANGE — 要注意"}
        </span>
      </div>

      {/* Athlete info */}
      <div className="px-5 py-4 flex-1">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {card.athlete_name}
            </h3>
            <p className="text-xs text-slate-500">{card.position}</p>
          </div>
          <div className="text-right">
            <span
              className={`text-2xl font-bold font-numeric ${
                card.readiness_score < 40
                  ? "text-red-600"
                  : card.readiness_score < 60
                    ? "text-amber-600"
                    : "text-brand-600"
              }`}
            >
              {Math.round(card.readiness_score)}
            </span>
            <p className="text-2xs text-slate-400">Readiness</p>
          </div>
        </div>

        {/* AI Recommendation */}
        <div className="bg-slate-50 rounded-lg p-3 mb-3">
          <p className="text-xs text-slate-700 leading-relaxed">
            {card.recommendation}
          </p>
        </div>

        {/* Evidence */}
        {card.evidence_text && (
          <p className="text-2xs text-slate-500 mb-3">
            <span className="font-medium">根拠: </span>
            {card.evidence_text}
          </p>
        )}

        {/* Risk gauge */}
        <div className="flex items-center gap-2">
          <span className="text-2xs text-slate-400">リスク:</span>
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                card.risk_score > 70
                  ? "bg-red-500"
                  : card.risk_score > 40
                    ? "bg-amber-500"
                    : "bg-brand-500"
              }`}
              style={{ width: `${Math.min(100, card.risk_score)}%` }}
            />
          </div>
          <span className="text-2xs font-numeric text-slate-600">
            {card.risk_score}%
          </span>
        </div>
      </div>

      {/* Legal disclaimer */}
      <div className="px-5 py-2 border-t border-slate-100 bg-slate-50/50">
        <p className="text-2xs text-slate-400">
          ※ 判定支援の参考情報です。最終決定は有資格者が行ってください。
        </p>
      </div>

      {/* Swipe hint */}
      <div className="px-5 py-3 flex justify-between border-t border-slate-100">
        <span className="text-2xs text-red-400 font-medium flex items-center gap-1">
          <X className="w-3 h-3" /> 却下（Override）
        </span>
        <span className="text-2xs text-brand-500 font-medium flex items-center gap-1">
          承認（Approve） <Check className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
}

function DraggableTriageCard({
  card,
  onDecision,
  isTop,
}: {
  card: TriageSwipeCard;
  onDecision: (decision: "APPROVED" | "OVERRIDE_BY_COACH") => void;
  isTop: boolean;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-8, 8]);
  const approveOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const overrideOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const [thresholdHit, setThresholdHit] = useState(false);

  const handleDrag = useCallback(
    (_: unknown, info: PanInfo) => {
      const abs = Math.abs(info.offset.x);
      if (abs >= SWIPE_THRESHOLD && !thresholdHit) {
        setThresholdHit(true);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(50);
        }
      } else if (abs < SWIPE_THRESHOLD && thresholdHit) {
        setThresholdHit(false);
      }
    },
    [thresholdHit]
  );

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (Math.abs(info.offset.x) < SWIPE_THRESHOLD) {
        setThresholdHit(false);
        return;
      }
      onDecision(info.offset.x > 0 ? "APPROVED" : "OVERRIDE_BY_COACH");
    },
    [onDecision]
  );

  if (!isTop) {
    return (
      <div className="absolute inset-0">
        <div className="w-full h-full bg-white rounded-2xl shadow-md border border-slate-200 scale-[0.96] opacity-50" />
      </div>
    );
  }

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      style={{ x, rotate }}
      exit={{
        x: x.get() > 0 ? 500 : -500,
        opacity: 0,
        transition: { duration: 0.3 },
      }}
      className="absolute inset-0 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none"
    >
      {/* Approve overlay */}
      <motion.div
        style={{ opacity: approveOpacity }}
        className="absolute inset-0 bg-brand-50/80 border-2 border-brand-400 rounded-2xl flex items-center justify-center pointer-events-none z-20"
      >
        <div className="bg-brand-600 text-white rounded-full p-4">
          <Check className="w-8 h-8" />
        </div>
      </motion.div>

      {/* Override overlay */}
      <motion.div
        style={{ opacity: overrideOpacity }}
        className="absolute inset-0 bg-red-50/80 border-2 border-red-400 rounded-2xl flex items-center justify-center pointer-events-none z-20"
      >
        <div className="bg-red-600 text-white rounded-full p-4">
          <X className="w-8 h-8" />
        </div>
      </motion.div>

      <TriageCardContent card={card} />
    </motion.div>
  );
}

export function TriageSwipe({
  cards,
  onDecision,
  onAllProcessed,
}: TriageSwipeProps) {
  const [processedCount, setProcessedCount] = useState(0);

  const remainingCards = cards.slice(processedCount);

  const handleDecision = useCallback(
    (decision: "APPROVED" | "OVERRIDE_BY_COACH") => {
      const card = cards[processedCount];
      if (!card) return;

      onDecision(card.athlete_id, decision, card);

      const next = processedCount + 1;
      setProcessedCount(next);

      if (next >= cards.length) {
        onAllProcessed();
      }
    },
    [cards, processedCount, onDecision, onAllProcessed]
  );

  if (remainingCards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] text-center">
        <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center mb-4">
          <Shield className="w-8 h-8 text-brand-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">
          全件処理完了
        </h2>
        <p className="text-sm text-slate-500">
          {cards.length} 件のアクションを処理しました
        </p>
        <a
          href="/dashboard"
          className="mt-4 flex items-center gap-1 text-sm text-brand-600 font-medium"
        >
          ダッシュボードへ <ChevronRight className="w-4 h-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {/* Progress */}
      <div className="w-full max-w-[400px] mb-4">
        <div className="flex justify-between text-2xs text-slate-400 mb-1">
          <span>
            {processedCount + 1} / {cards.length} 件
          </span>
          <span>
            {Math.round(((processedCount) / cards.length) * 100)}% 完了
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-300"
            style={{
              width: `${(processedCount / cards.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Card Stack */}
      <div className="relative w-full max-w-[400px] h-[520px]">
        <AnimatePresence>
          {remainingCards.slice(0, 2).map((card, i) => (
            <DraggableTriageCard
              key={card.athlete_id}
              card={card}
              onDecision={handleDecision}
              isTop={i === 0}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
