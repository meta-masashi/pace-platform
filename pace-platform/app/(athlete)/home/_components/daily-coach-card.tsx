'use client';

/**
 * M5 — AI Daily Coach カード
 *
 * MASTER-SPEC M5 準拠:
 * - コンディションスコアに基づくパーソナライズされた今日のコーチングメッセージを表示
 * - Action of the Day / トレーニング指針 / リカバリーアドバイスを統合
 * - 医療免責事項 (M20) を含む
 *
 * コンポーネントは InsightCard とは異なり、より会話的・コーチング的な
 * プレゼンテーションを提供する。
 */

import { useState } from 'react';

const MEDICAL_DISCLAIMER =
  '※ この出力はAIによる補助情報です。最終的な判断・処置は必ず有資格スタッフが行ってください。';

// ---------------------------------------------------------------------------
// アイコン
// ---------------------------------------------------------------------------

function CoachIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a5 5 0 015 5v1a5 5 0 01-10 0V7a5 5 0 015-5z" />
      <path d="M18.5 10c1.5 1 2.5 2.5 2.5 4.5 0 3.5-2.5 6-9 6s-9-2.5-9-6c0-2 1-3.5 2.5-4.5" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// スコアに基づく推奨アドバイスを生成
// ---------------------------------------------------------------------------

interface CoachingAdvice {
  greeting: string;
  focusToday: string;
  warmupAdvice: string;
  recoveryTip: string;
  intensity: 'full' | 'moderate' | 'light' | 'rest';
}

function generateCoachingAdvice(
  score: number,
  displayName: string,
  actionOfDay: string,
): CoachingAdvice {
  const firstName = displayName.split(' ')[0] ?? displayName;

  if (score >= 80) {
    return {
      greeting: `${firstName}さん、今日は絶好調です！`,
      focusToday: actionOfDay,
      warmupAdvice: '標準的なウォーミングアップ（10〜15分）で問題ありません。',
      recoveryTip: '練習後は水分補給とクールダウンを忘れずに。',
      intensity: 'full',
    };
  }
  if (score >= 60) {
    return {
      greeting: `${firstName}さん、良い状態です。`,
      focusToday: actionOfDay,
      warmupAdvice: 'ウォーミングアップを入念に（15〜20分）行いましょう。',
      recoveryTip: '練習後はストレッチと栄養補給を意識してください。',
      intensity: 'moderate',
    };
  }
  if (score >= 40) {
    return {
      greeting: `${firstName}さん、今日は身体のサインに注意しましょう。`,
      focusToday: actionOfDay,
      warmupAdvice: '長めのウォーミングアップ（20分以上）を行い、無理は禁物です。',
      recoveryTip: '十分な睡眠と栄養を確保してください。アイシングも効果的です。',
      intensity: 'light',
    };
  }
  return {
    greeting: `${firstName}さん、今日はしっかり回復しましょう。`,
    focusToday: actionOfDay,
    warmupAdvice: '激しい運動は控え、軽いモビリティワークにとどめましょう。',
    recoveryTip: '睡眠、栄養、水分補給を最優先にしてください。スタッフに相談することをお勧めします。',
    intensity: 'rest',
  };
}

const INTENSITY_LABELS: Record<CoachingAdvice['intensity'], string> = {
  full: '通常強度',
  moderate: '中程度',
  light: '軽め',
  rest: '回復優先',
};

const INTENSITY_COLORS: Record<CoachingAdvice['intensity'], string> = {
  full: 'bg-green-500/15 text-green-700 ring-green-500/30',
  moderate: 'bg-watchlist-500/15 text-watchlist-700 ring-watchlist-500/30',
  light: 'bg-orange-500/15 text-orange-700 ring-orange-500/30',
  rest: 'bg-critical-500/15 text-critical-700 ring-critical-500/30',
};

// ---------------------------------------------------------------------------
// プロパティ
// ---------------------------------------------------------------------------

interface DailyCoachCardProps {
  score: number;
  displayName: string;
  actionOfDay: string;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function DailyCoachCard({
  score,
  displayName,
  actionOfDay,
}: DailyCoachCardProps) {
  const [expanded, setExpanded] = useState(false);

  const advice = generateCoachingAdvice(score, displayName, actionOfDay);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* ヘッダー */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/50 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CoachIcon />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              AI デイリーコーチ
            </p>
            <p className="text-sm font-medium leading-tight">{advice.greeting}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${INTENSITY_COLORS[advice.intensity]}`}
          >
            {INTENSITY_LABELS[advice.intensity]}
          </span>
          <ChevronIcon expanded={expanded} />
        </div>
      </button>

      {/* 今日のフォーカス（常時表示） */}
      <div className="border-t border-border/60 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
          今日のアクション
        </p>
        <p className="text-sm font-semibold text-foreground">{advice.focusToday}</p>
      </div>

      {/* 展開パネル: 詳細アドバイス */}
      {expanded && (
        <div className="border-t border-border/60 px-4 py-3 flex flex-col gap-3">
          {/* ウォーミングアップ */}
          <div className="flex gap-2.5">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckIcon />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">ウォーミングアップ</p>
              <p className="text-sm">{advice.warmupAdvice}</p>
            </div>
          </div>

          {/* リカバリーアドバイス */}
          <div className="flex gap-2.5">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckIcon />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">リカバリーのヒント</p>
              <p className="text-sm">{advice.recoveryTip}</p>
            </div>
          </div>

          {/* 医療免責事項 M20 */}
          <p className="mt-1 border-t border-border/50 pt-2 text-[11px] leading-snug text-muted-foreground">
            {MEDICAL_DISCLAIMER}
          </p>
        </div>
      )}
    </div>
  );
}
