"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SwipeCard } from "./swipe-card";
import type {
  SwipeQuestion,
  SwipeResponsePayload,
  SwipeTelemetry,
} from "@/types/swipe-assessment";
import { CheckCircle2, Loader2, Undo2, WifiOff } from "lucide-react";

// ─── Fisher-Yates shuffle (gaming prevention) ──────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ─── Local Queue for offline resilience ────────────────────────────────────

const QUEUE_KEY = "pace_swipe_queue";

function enqueueOffline(responses: SwipeResponsePayload[]) {
  try {
    const existing = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    existing.push({ responses, timestamp: Date.now() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(existing));
  } catch {
    // localStorage unavailable
  }
}

function flushOfflineQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return;
    const queue = JSON.parse(raw);
    localStorage.removeItem(QUEUE_KEY);
    for (const item of queue) {
      fetch("/api/athlete/swipe-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: item.responses }),
      }).catch(() => {
        // Re-queue if still offline
        enqueueOffline(item.responses);
      });
    }
  } catch {
    // noop
  }
}

// Flush on reconnect
if (typeof window !== "undefined") {
  window.addEventListener("online", flushOfflineQueue);
}

// ─── Default questions ─────────────────────────────────────────────────────

const DEFAULT_QUESTIONS: SwipeQuestion[] = [
  { id: "q_sleep_quality", text: "昨晩はよく眠れましたか？", category: "sleep" },
  { id: "q_general_fatigue", text: "全身に疲労感がありますか？", category: "fatigue" },
  { id: "q_hamstring_soreness", text: "ハムストリングに張りがありますか？", body_part: "ハムストリング", category: "pain" },
  { id: "q_knee_pain", text: "膝に違和感がありますか？", body_part: "膝", category: "pain" },
  { id: "q_lower_back", text: "腰に重さや痛みがありますか？", body_part: "腰", category: "pain" },
  { id: "q_mental_readiness", text: "今日のトレーニングに集中できそうですか？", category: "mental" },
];

// ─── Component ─────────────────────────────────────────────────────────────

interface BioSwipeFlowProps {
  athleteId: string;
  questions?: SwipeQuestion[];
  onComplete: (responses: SwipeResponsePayload[]) => void;
}

export function BioSwipeFlow({
  athleteId,
  questions = DEFAULT_QUESTIONS,
  onComplete,
}: BioSwipeFlowProps) {
  const shuffledQuestions = useMemo(() => shuffle(questions), [questions]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<SwipeResponsePayload[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // Undo state
  const [undoVisible, setUndoVisible] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResponseRef = useRef<SwipeResponsePayload | null>(null);

  const isComplete = currentIndex >= shuffledQuestions.length;
  const progress = shuffledQuestions.length > 0
    ? Math.round((currentIndex / shuffledQuestions.length) * 100)
    : 0;

  const handleUndo = useCallback(() => {
    if (currentIndex <= 0) return;
    setCurrentIndex((prev) => prev - 1);
    setResponses((prev) => prev.slice(0, -1));
    setUndoVisible(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    lastResponseRef.current = null;
  }, [currentIndex]);

  const handleSwipe = useCallback(
    async (response: -1 | 1, telemetry: SwipeTelemetry) => {
      const question = shuffledQuestions[currentIndex];
      if (!question) return;

      const payload: SwipeResponsePayload = {
        athlete_id: athleteId,
        question_id: question.id,
        response,
        reaction_latency_ms: telemetry.swipe_release_time
          ? telemetry.swipe_release_time - telemetry.view_start_time
          : 0,
        hesitation_time_ms:
          telemetry.first_touch_time && telemetry.swipe_release_time
            ? telemetry.swipe_release_time - telemetry.first_touch_time
            : 0,
        swipe_velocity: Math.round(telemetry.swipe_velocity),
      };

      const newResponses = [...responses, payload];
      setResponses(newResponses);
      setCurrentIndex((prev) => prev + 1);

      // Show Undo toast for 3 seconds
      lastResponseRef.current = payload;
      setUndoVisible(true);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setUndoVisible(false), 3000);

      // If all questions answered, submit batch
      if (newResponses.length === shuffledQuestions.length) {
        setUndoVisible(false);
        setSubmitting(true);

        // Optimistic: show completion immediately
        const online = navigator.onLine;
        if (!online) {
          // Offline: queue locally
          enqueueOffline(newResponses);
          setIsOffline(true);
          setDone(true);
          onComplete(newResponses);
          setSubmitting(false);
          return;
        }

        try {
          await fetch("/api/athlete/swipe-checkin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ responses: newResponses }),
          });
          setDone(true);
          onComplete(newResponses);
        } catch {
          // Network failed mid-request: queue locally
          enqueueOffline(newResponses);
          setIsOffline(true);
          setDone(true);
          onComplete(newResponses);
        } finally {
          setSubmitting(false);
        }
      }
    },
    [athleteId, currentIndex, responses, shuffledQuestions, onComplete]
  );

  // Completion state
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] text-center px-6">
        <div className="w-16 h-16 rounded-full bg-brand-900/50 border border-brand-700 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-brand-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-100 mb-1">
          チェックイン完了
        </h2>
        <p className="text-sm text-slate-500">
          AIがコンディションを分析中です...
        </p>
        {isOffline && (
          <div className="flex items-center gap-2 mt-4 text-amber-400 text-xs">
            <WifiOff className="w-4 h-4" />
            <span>オフライン — 電波回復時に自動送信されます</span>
          </div>
        )}
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px]">
        <Loader2 className="w-8 h-8 text-brand-400 animate-spin mb-3" />
        <p className="text-sm text-slate-500">同期中...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {/* Progress */}
      <div className="w-full max-w-[340px] mb-6">
        <div className="flex justify-between text-2xs text-slate-500 mb-1">
          <span>{currentIndex + 1} / {shuffledQuestions.length}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Card Stack */}
      <div className="relative w-[340px] h-[440px]">
        <AnimatePresence>
          {shuffledQuestions.map((q, i) => {
            if (i < currentIndex) return null;
            if (i > currentIndex + 1) return null;
            return (
              <SwipeCard
                key={q.id}
                question={q}
                onSwipe={handleSwipe}
                isTop={i === currentIndex}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {/* Hint */}
      <p className="text-2xs text-slate-600 mt-4">
        左右にスワイプして回答
      </p>

      {/* ─── Undo Toast ─── */}
      <AnimatePresence>
        {undoVisible && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
          >
            <button
              onClick={handleUndo}
              className="flex items-center gap-2 px-5 py-3 bg-slate-800 border border-slate-700 rounded-full shadow-lg text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <Undo2 className="w-4 h-4" />
              元に戻す
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
