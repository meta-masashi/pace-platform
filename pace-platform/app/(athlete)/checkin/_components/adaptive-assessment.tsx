"use client";

/**
 * アダプティブ・アセスメント — v6.0 適応型チェックイン
 *
 * 前日の sRPE に基づいて質問モードを切替:
 *   - Fatigue Focus (sRPE > 7): 疲労・痛み・睡眠のみ
 *   - Vigor Mode (sRPE <= 4): モチベーション・準備度を追加
 *   - Normal: 標準質問セット
 *
 * 3 セッションごとにトラスト声明を表示。
 * 質問順序のランダマイズでゲーミング防止。
 * レスポンスレイテンシーを計測。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface AssessmentData {
  fatigue: number;
  pain_nrs: number;
  sleep_quality: number;
  subjective_condition: number;
  motivation?: number;
  readiness?: number;
  mode: "fatigue_focus" | "normal" | "vigor";
  response_latency_ms: number;
}

export interface AdaptiveAssessmentProps {
  athleteId: string;
  /** 前日の sRPE（0-10） */
  yesterdaySrpe?: number;
  /** 通算セッション回数（トラスト声明表示判定用） */
  sessionCount: number;
  /** 送信コールバック */
  onSubmit: (data: AssessmentData) => Promise<void>;
}

// ---------------------------------------------------------------------------
// 質問定義
// ---------------------------------------------------------------------------

interface QuestionDef {
  key: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}

const CORE_QUESTIONS: QuestionDef[] = [
  {
    key: "fatigue",
    label: "疲労感",
    hint: "0＝疲労なし　10＝極度の疲労",
    min: 0,
    max: 10,
    step: 1,
  },
  {
    key: "pain_nrs",
    label: "痛み (NRS)",
    hint: "0＝痛みなし　10＝最大の痛み",
    min: 0,
    max: 10,
    step: 1,
  },
  {
    key: "sleep_quality",
    label: "睡眠の質",
    hint: "0＝非常に悪い　10＝非常に良い",
    min: 0,
    max: 10,
    step: 1,
  },
];

const NORMAL_QUESTIONS: QuestionDef[] = [
  {
    key: "subjective_condition",
    label: "主観的体調",
    hint: "0＝最悪　10＝最高",
    min: 0,
    max: 10,
    step: 1,
  },
];

const VIGOR_QUESTIONS: QuestionDef[] = [
  {
    key: "motivation",
    label: "モチベーション",
    hint: "0＝やる気なし　10＝最高に意欲的",
    min: 0,
    max: 10,
    step: 1,
  },
  {
    key: "readiness",
    label: "トレーニング準備度",
    hint: "0＝全く準備できていない　10＝万全",
    min: 0,
    max: 10,
    step: 1,
  },
];

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/** Fisher-Yates シャッフル（非破壊） */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function getMode(
  yesterdaySrpe?: number
): "fatigue_focus" | "normal" | "vigor" {
  if (yesterdaySrpe !== undefined && yesterdaySrpe > 7) return "fatigue_focus";
  if (yesterdaySrpe !== undefined && yesterdaySrpe <= 4) return "vigor";
  return "normal";
}

function getModeLabel(mode: "fatigue_focus" | "normal" | "vigor"): string {
  switch (mode) {
    case "fatigue_focus":
      return "疲労フォーカス";
    case "vigor":
      return "バイガーモード";
    case "normal":
      return "標準";
  }
}

function getModeBadgeColor(mode: "fatigue_focus" | "normal" | "vigor"): string {
  switch (mode) {
    case "fatigue_focus":
      return "bg-pulse-red-100 text-pulse-red-700";
    case "vigor":
      return "bg-optimal-100 text-optimal-700";
    case "normal":
      return "bg-muted text-muted-foreground";
  }
}

// ---------------------------------------------------------------------------
// スライダー（ハプティックフィードバック風スタイル付き）
// ---------------------------------------------------------------------------

function HapticSlider({
  question,
  value,
  onChange,
}: {
  question: QuestionDef;
  value: number;
  onChange: (v: number) => void;
}) {
  const [touching, setTouching] = useState(false);

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 shadow-sm transition-transform duration-150 ${
        touching ? "scale-[1.01]" : ""
      } motion-reduce:transform-none`}
    >
      <div className="flex items-baseline justify-between">
        <label
          htmlFor={question.key}
          className="text-sm font-medium text-foreground"
        >
          {question.label}
        </label>
        <span className="font-label text-lg font-bold tabular-nums text-primary">
          {value}
        </span>
      </div>
      <p className="text-2xs text-muted-foreground">{question.hint}</p>
      <input
        id={question.key}
        type="range"
        min={question.min}
        max={question.max}
        step={question.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onTouchStart={() => setTouching(true)}
        onTouchEnd={() => setTouching(false)}
        onMouseDown={() => setTouching(true)}
        onMouseUp={() => setTouching(false)}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{question.min}</span>
        <span>{question.max}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function AdaptiveAssessment({
  athleteId,
  yesterdaySrpe,
  sessionCount,
  onSubmit,
}: AdaptiveAssessmentProps) {
  const renderTime = useRef(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // フォーム値
  const [values, setValues] = useState<Record<string, number>>({
    fatigue: 3,
    pain_nrs: 0,
    sleep_quality: 7,
    subjective_condition: 7,
    motivation: 7,
    readiness: 7,
  });

  const mode = getMode(yesterdaySrpe);
  const showTrustStatement = sessionCount > 0 && sessionCount % 3 === 0;

  // 質問セットの構築とランダマイズ（初回マウント時のみ）
  const questions = useMemo(() => {
    let qs: QuestionDef[];

    switch (mode) {
      case "fatigue_focus":
        // 疲労・痛み・睡眠のみ
        qs = [...CORE_QUESTIONS];
        break;
      case "vigor":
        // コア + 標準 + バイガー質問
        qs = [...CORE_QUESTIONS, ...NORMAL_QUESTIONS, ...VIGOR_QUESTIONS];
        break;
      case "normal":
      default:
        qs = [...CORE_QUESTIONS, ...NORMAL_QUESTIONS];
        break;
    }

    return shuffle(qs);
  }, [mode]);

  // レンダー時刻をリセット
  useEffect(() => {
    renderTime.current = Date.now();
  }, []);

  const handleChange = useCallback((key: string, v: number) => {
    setValues((prev) => ({ ...prev, [key]: v }));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const responseLatency = Date.now() - renderTime.current;

    const data: AssessmentData = {
      fatigue: values.fatigue ?? 3,
      pain_nrs: values.pain_nrs ?? 0,
      sleep_quality: values.sleep_quality ?? 7,
      subjective_condition: values.subjective_condition ?? 7,
      mode,
      response_latency_ms: responseLatency,
    };

    if (mode === "vigor") {
      data.motivation = values.motivation ?? 7;
      data.readiness = values.readiness ?? 7;
    }

    try {
      await onSubmit(data);
      setSubmitted(true);
    } catch {
      setError("送信に失敗しました。再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  // 完了画面
  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-optimal-100">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-optimal-600"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-foreground">
          チェックイン完了
        </h2>
        <p className="text-sm text-muted-foreground">
          データが記録されました。ホーム画面でスコアを確認できます。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* モードバッジ */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">
          コンディションチェック
        </h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-2xs font-semibold ${getModeBadgeColor(mode)}`}
        >
          {getModeLabel(mode)}
        </span>
      </div>

      {/* 前日 sRPE 表示（Fatigue Focus 時のみ） */}
      {mode === "fatigue_focus" && yesterdaySrpe !== undefined && (
        <div className="rounded-lg border border-pulse-red-200 bg-pulse-red-50 p-3">
          <p className="text-xs text-pulse-red-700">
            昨日の sRPE が高い値（{yesterdaySrpe}）でした。回復状態を確認するため、最小限の質問に絞っています。
          </p>
        </div>
      )}

      {/* トラスト声明（3セッションごと） */}
      {showTrustStatement && (
        <div className="rounded-lg border border-optimal-200 bg-optimal-50 p-3">
          <p className="text-xs leading-relaxed text-optimal-800">
            この入力データは、あなたのコンディションを保護するためだけに使用され、スタメン選考や評価には一切使用されません
          </p>
        </div>
      )}

      {/* エラー */}
      {error && (
        <div className="rounded-lg border border-critical-200 bg-critical-50 p-3">
          <p className="text-sm text-critical-700">{error}</p>
        </div>
      )}

      {/* 質問スライダー */}
      <div className="flex flex-col gap-3">
        {questions.map((q) => (
          <HapticSlider
            key={q.key}
            question={q}
            value={values[q.key] ?? q.min}
            onChange={(v) => handleChange(q.key, v)}
          />
        ))}
      </div>

      {/* 送信ボタン */}
      <button
        type="submit"
        disabled={submitting}
        className="mt-2 h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none"
      >
        {submitting ? "送信中..." : "チェックインする"}
      </button>

      {/* 選手 ID（hidden reference） */}
      <input type="hidden" name="athlete_id" value={athleteId} />
    </form>
  );
}
