"use client";

import { useRef, useState, useCallback } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import {
  Activity,
  Gauge,
  CloudLightning,
  Crosshair,
  Brain,
  Moon,
} from "lucide-react";
import type { SwipeQuestion, SwipeTelemetry } from "@/types/swipe-assessment";

/** スワイプ確定の閾値 (px) */
const SWIPE_THRESHOLD = 100;
/** 画面外への排出距離 */
const EXIT_X = 400;

interface SwipeCardProps {
  question: SwipeQuestion;
  onSwipe: (response: -1 | 1, telemetry: SwipeTelemetry) => void;
  isTop: boolean;
}

// ─── Bio-Cybernetic Icon System ────────────────────────────────────────────

const CATEGORY_ICON: Record<string, { icon: typeof Activity; color: string }> = {
  pain:     { icon: Crosshair,      color: "text-slate-600" },
  fatigue:  { icon: Activity,       color: "text-slate-600" },
  mobility: { icon: Activity,       color: "text-slate-600" },
  sleep:    { icon: Moon,           color: "text-slate-600" },
  mental:   { icon: Brain,          color: "text-slate-600" },
};

function triggerHaptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(50);
  }
}

export function SwipeCard({ question, onSwipe, isTop }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const yesOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const noOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);

  // Morphing: neutral → bad(right) icon color shift
  const iconHue = useTransform(x, [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD], [140, 210, 0]);
  // Icon scale pop on threshold
  const iconScale = useTransform(
    x,
    [-SWIPE_THRESHOLD - 20, -SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD, SWIPE_THRESHOLD + 20],
    [1.15, 1.2, 1, 1.2, 1.15]
  );

  // Telemetry tracking
  const viewStartRef = useRef(Date.now());
  const firstTouchRef = useRef<number | null>(null);
  const [thresholdReached, setThresholdReached] = useState(false);

  const handleDragStart = useCallback(() => {
    if (firstTouchRef.current === null) {
      firstTouchRef.current = Date.now();
    }
  }, []);

  const handleDrag = useCallback(
    (_: unknown, info: PanInfo) => {
      const absPx = Math.abs(info.offset.x);
      if (absPx >= SWIPE_THRESHOLD && !thresholdReached) {
        setThresholdReached(true);
        triggerHaptic();
      } else if (absPx < SWIPE_THRESHOLD && thresholdReached) {
        setThresholdReached(false);
      }
    },
    [thresholdReached]
  );

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const absPx = Math.abs(info.offset.x);
      if (absPx < SWIPE_THRESHOLD) {
        setThresholdReached(false);
        return;
      }

      const now = Date.now();
      const response: -1 | 1 = info.offset.x > 0 ? 1 : -1;

      const telemetry: SwipeTelemetry = {
        view_start_time: viewStartRef.current,
        first_touch_time: firstTouchRef.current,
        swipe_release_time: now,
        swipe_velocity: Math.abs(info.velocity.x),
      };

      onSwipe(response, telemetry);
    },
    [onSwipe]
  );

  const catCfg = CATEGORY_ICON[question.category] ?? CATEGORY_ICON.fatigue!;
  const IconComponent = catCfg.icon;

  if (!isTop) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[320px] h-[420px] bg-slate-950 rounded-2xl shadow-md border border-slate-800 scale-[0.95] opacity-60" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.8}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{ x, rotate }}
        animate={thresholdReached ? {} : { x: 0 }}
        exit={{
          x: x.get() > 0 ? EXIT_X : -EXIT_X,
          opacity: 0,
          transition: { duration: 0.3 },
        }}
        className="relative w-[320px] h-[420px] bg-slate-950 rounded-2xl shadow-xl border border-slate-800 cursor-grab active:cursor-grabbing select-none touch-none overflow-hidden"
      >
        {/* YES overlay (right swipe — 不良/張りあり) */}
        <motion.div
          style={{ opacity: yesOpacity }}
          className="absolute inset-0 rounded-2xl bg-red-950/60 border-2 border-red-500/50 flex items-start justify-end p-5 pointer-events-none z-20"
        >
          <div className="bg-red-500 text-white rounded-full p-2">
            <CloudLightning className="w-6 h-6" />
          </div>
          <span className="absolute top-5 left-5 text-red-400 font-bold text-lg rotate-[-12deg] tracking-wide">
            張りあり
          </span>
        </motion.div>

        {/* NO overlay (left swipe — 良好/快調) */}
        <motion.div
          style={{ opacity: noOpacity }}
          className="absolute inset-0 rounded-2xl bg-teal-950/60 border-2 border-teal-500/50 flex items-start justify-start p-5 pointer-events-none z-20"
        >
          <div className="bg-brand-500 text-white rounded-full p-2">
            <Gauge className="w-6 h-6" />
          </div>
          <span className="absolute top-5 right-5 text-brand-400 font-bold text-lg rotate-[12deg] tracking-wide">
            キレがある
          </span>
        </motion.div>

        {/* Card content — Deep Space theme */}
        <div className="relative z-10 h-full flex flex-col items-center justify-center p-8 text-center">
          {/* Category badge */}
          <span className="text-2xs font-semibold text-slate-500 uppercase tracking-[0.2em] mb-6">
            {question.category}
          </span>

          {/* Bio-Cybernetic Icon (morphing color on drag) */}
          <motion.div
            style={{
              scale: iconScale,
              filter: useTransform(iconHue, (h) => `hue-rotate(${h}deg)`),
            }}
            className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center mb-6"
          >
            <IconComponent className="w-10 h-10 text-brand-400" strokeWidth={1.5} />
          </motion.div>

          {/* Question text */}
          <h2 className="text-lg font-bold text-slate-100 leading-snug mb-2">
            {question.text}
          </h2>

          {question.body_part && (
            <p className="text-sm text-slate-500 font-medium">{question.body_part}</p>
          )}

          {/* Swipe hint */}
          <div className="absolute bottom-6 left-0 right-0 flex justify-between px-8">
            <div className="flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-brand-500" />
              <span className="text-2xs text-brand-500 font-medium">
                ← キレがある
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-2xs text-red-400 font-medium">
                張りあり →
              </span>
              <CloudLightning className="w-3.5 h-3.5 text-red-400" />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
