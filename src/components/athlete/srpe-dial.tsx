"use client";

/**
 * sRPE Rotary Dial — 練習後の主観的運動強度入力
 * iPodホイール風のダイヤルで 0-10 を入力。
 * 数値が上がるほど画面色が青→赤に変化、Haptics も重くなる。
 */

import { useCallback, useRef, useState } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { Send, Loader2 } from "lucide-react";

interface SrpeDialProps {
  athleteId: string;
  sessionId?: string;
  onSubmit: (value: number) => void;
}

function triggerHaptic(intensity: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    // Heavier vibration for higher values
    navigator.vibrate(Math.min(200, 20 + intensity * 18));
  }
}

export function SrpeDial({ athleteId, sessionId, onSubmit }: SrpeDialProps) {
  const [value, setValue] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const lastHapticRef = useRef(value);

  // Color interpolation: blue (0) → amber (5) → red (10)
  const bgColor = (() => {
    if (value <= 3) return "from-blue-950 to-slate-950";
    if (value <= 6) return "from-amber-950 to-slate-950";
    return "from-red-950 to-slate-950";
  })();

  const dialColor = (() => {
    if (value <= 3) return "text-blue-400";
    if (value <= 6) return "text-amber-400";
    return "text-red-400";
  })();

  const ringColor = (() => {
    if (value <= 3) return "border-blue-600";
    if (value <= 6) return "border-amber-600";
    return "border-red-600";
  })();

  const labels = [
    "全く疲れない",
    "非常に楽",
    "楽",
    "やや楽",
    "普通",
    "ややキツい",
    "キツい",
    "かなりキツい",
    "非常にキツい",
    "極めてキツい",
    "限界",
  ];

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = Number(e.target.value);
      setValue(newVal);
      // Haptic on each step change
      if (newVal !== lastHapticRef.current) {
        triggerHaptic(newVal);
        lastHapticRef.current = newVal;
      }
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      await fetch("/api/athlete/swipe-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "srpe",
          athlete_id: athleteId,
          session_id: sessionId,
          srpe_value: value,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // Offline: queue
      try {
        const queue = JSON.parse(localStorage.getItem("pace_srpe_queue") || "[]");
        queue.push({ athlete_id: athleteId, session_id: sessionId, srpe_value: value, timestamp: Date.now() });
        localStorage.setItem("pace_srpe_queue", JSON.stringify(queue));
      } catch { /* noop */ }
    }
    setDone(true);
    setSubmitting(false);
    onSubmit(value);
  }, [athleteId, sessionId, value, onSubmit]);

  if (done) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 rounded-full bg-brand-900/50 border border-brand-700 flex items-center justify-center mx-auto mb-4">
            <Send className="w-7 h-7 text-brand-400" />
          </div>
          <h2 className="text-xl font-bold">送信完了</h2>
          <p className="text-sm text-slate-500 mt-1">お疲れさまでした</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-b ${bgColor} flex flex-col items-center justify-center text-white px-8 transition-colors duration-500`}>
      <p className="text-xs text-slate-500 uppercase tracking-[0.2em] mb-2">
        POST-SESSION
      </p>
      <h1 className="text-lg font-bold text-slate-200 mb-8">
        今日のトレーニング、どれくらいキツかった？
      </h1>

      {/* Dial display */}
      <div className="relative mb-8">
        <div
          className={`w-48 h-48 rounded-full border-4 ${ringColor} flex flex-col items-center justify-center transition-colors duration-300`}
        >
          <motion.span
            key={value}
            initial={{ scale: 1.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`text-6xl font-bold font-numeric ${dialColor} transition-colors duration-300`}
          >
            {value}
          </motion.span>
          <span className="text-xs text-slate-500 mt-1">/ 10</span>
        </div>
      </div>

      {/* Label */}
      <motion.p
        key={value}
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={`text-sm font-medium ${dialColor} mb-8 transition-colors duration-300`}
      >
        {labels[value]}
      </motion.p>

      {/* Range slider (acts as the rotary dial) */}
      <div className="w-full max-w-xs mb-8">
        <input
          type="range"
          min="0"
          max="10"
          step="1"
          value={value}
          onChange={handleChange}
          className={`w-full h-3 rounded-full appearance-none cursor-pointer transition-all duration-300 ${
            value <= 3
              ? "accent-blue-500 bg-blue-900/50"
              : value <= 6
                ? "accent-amber-500 bg-amber-900/50"
                : "accent-red-500 bg-red-900/50"
          }`}
        />
        <div className="flex justify-between text-2xs text-slate-600 mt-2">
          <span>0 楽</span>
          <span>5</span>
          <span>10 限界</span>
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="flex items-center gap-2 px-8 py-3.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-medium text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        送信する
      </button>

      {/* Legal */}
      <p className="text-2xs text-slate-700 mt-8 text-center">
        ※ 意思決定支援の参考情報です。医療診断ではありません。
      </p>
    </div>
  );
}
