'use client';

/**
 * デイリー・コンパス (The Action Screen)
 *
 * Bio-Swipe 完了直後に表示される「今日の行動指針」画面。
 * 巨大なステータスサークル + 処方箋リスト。
 *
 * 選手に「なぜ制限されたか」の数式は見せない。
 * 「PACEとコーチが決めた今日の最適メニュー」として決定事項のみ伝達。
 */

import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type DailyStatus = 'CLEAR' | 'ADJUSTED';

export interface Prescription {
  icon: string;
  text: string;
}

export interface DailyCompassProps {
  status: DailyStatus;
  prescriptions: Prescription[];
  /** コーチ承認済みフラグ */
  coachApproved: boolean;
}

// ---------------------------------------------------------------------------
// ステータスサークル
// ---------------------------------------------------------------------------

function StatusCircle({ status }: { status: DailyStatus }) {
  const isClear = status === 'CLEAR';
  const ringColor = isClear ? '#10b981' : '#FF9F29';
  const glowShadow = isClear
    ? '0 0 40px rgba(16, 185, 129, 0.3), 0 0 80px rgba(16, 185, 129, 0.1)'
    : '0 0 40px rgba(255, 159, 41, 0.3), 0 0 80px rgba(255, 159, 41, 0.1)';
  const label = isClear ? 'CLEAR' : 'ADJUSTED';
  const sublabel = isClear ? '制限なし' : '調整中';

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative flex h-48 w-48 items-center justify-center rounded-full animate-status-pulse motion-reduce:animate-none"
        style={{ boxShadow: glowShadow }}
      >
        {/* 外枠リング */}
        <svg width="192" height="192" viewBox="0 0 192 192" className="absolute inset-0">
          <circle
            cx="96"
            cy="96"
            r="88"
            fill="none"
            stroke={ringColor}
            strokeWidth="3"
            opacity="0.3"
          />
          <circle
            cx="96"
            cy="96"
            r="88"
            fill="none"
            stroke={ringColor}
            strokeWidth="3"
            strokeDasharray="553"
            strokeDashoffset="0"
            strokeLinecap="round"
            className="animate-ring-fill motion-reduce:animate-none"
          />
        </svg>

        {/* 内側の塗り */}
        <div
          className="flex h-40 w-40 flex-col items-center justify-center rounded-full"
          style={{ backgroundColor: `${ringColor}10` }}
        >
          <p
            className="text-3xl font-bold tracking-wider"
            style={{ color: ringColor }}
          >
            {label}
          </p>
          <p className="mt-1 text-sm text-deep-space-200">{sublabel}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 処方箋リスト
// ---------------------------------------------------------------------------

function PrescriptionList({
  prescriptions,
  coachApproved,
}: {
  prescriptions: Prescription[];
  coachApproved: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    // 処方箋を1つずつフェードインさせる
    if (visibleCount < prescriptions.length) {
      const timer = setTimeout(() => {
        setVisibleCount((prev) => prev + 1);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [visibleCount, prescriptions.length]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-deep-space-100">
          本日のアクション
        </h3>
        {coachApproved && (
          <span className="rounded-full bg-optimal-500/20 px-2 py-0.5 text-[10px] font-medium text-optimal-400">
            コーチ承認済
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-2.5">
        {prescriptions.map((p, i) => (
          <li
            key={i}
            className={`flex items-start gap-3 rounded-xl bg-deep-space-500 p-4 transition-all duration-500 ${
              i < visibleCount
                ? 'translate-y-0 opacity-100'
                : 'translate-y-4 opacity-0'
            } motion-reduce:translate-y-0 motion-reduce:opacity-100`}
          >
            <span className="text-xl" role="img" aria-hidden="true">
              {p.icon}
            </span>
            <p className="flex-1 text-sm leading-relaxed text-deep-space-100">
              {p.text}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function DailyCompass({
  status,
  prescriptions,
  coachApproved,
}: DailyCompassProps) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-[#0D1117] px-6 pb-24 pt-12">
      {/* ステータスサークル */}
      <StatusCircle status={status} />

      {/* 処方箋リスト */}
      <div className="mt-10 w-full max-w-sm">
        <PrescriptionList
          prescriptions={prescriptions}
          coachApproved={coachApproved}
        />
      </div>

      {/* 安心メッセージ */}
      <div className="mt-8 rounded-xl border border-deep-space-400 bg-deep-space-500/50 px-4 py-3 text-center">
        <p className="text-xs leading-relaxed text-deep-space-200">
          このメニューは PACE AI とコーチの協議により、
          あなたの身体を守るために最適化されています。
        </p>
      </div>
    </div>
  );
}
