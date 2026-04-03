"use client";

/**
 * チェックインフォーム
 *
 * RPE, トレーニング時間, 睡眠の質, 主観的体調, 疲労感, 痛み NRS, HRV を入力。
 * POST /api/checkin に送信後、コンディショニングスコアを表示。
 */

import { useState } from "react";
import { ConditioningRing, getConditionZone } from "../../home/_components/conditioning-ring";

interface CheckinFormProps {
  athleteId: string;
  /** アスリートの性別（月経周期入力の表示判定に使用） */
  sex?: 'male' | 'female' | string;
  /** 最後のキャリブレーション日時（ISO string、未設定なら undefined） */
  lastCalibrationAt?: string;
  /** 直近の ACWR 値（Fatigue Focus Mode 判定用） */
  acwr?: number;
  /** 直近の Readiness スコア（Vigor Mode 判定用） */
  readinessScore?: number;
  /** 直近3日のスコアトレンド（Vigor Mode 判定用） */
  recentScores?: number[];
}

interface CheckinResult {
  conditioningScore: number;
  fitnessEwma: number;
  fatigueEwma: number;
  acwr: number;
}

// ---------------------------------------------------------------------------
// スライダー入力コンポーネント
// ---------------------------------------------------------------------------

function SliderField({
  label,
  name,
  min,
  max,
  step,
  value,
  onChange,
  hint,
}: {
  label: string;
  name: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={name} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <span className="text-lg font-bold tabular-nums text-primary">
          {value}
        </span>
      </div>
      {hint && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      <input
        id={name}
        name={name}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 数値入力コンポーネント
// ---------------------------------------------------------------------------

function NumberField({
  label,
  name,
  value,
  onChange,
  placeholder,
  unit,
  min,
  max,
  required,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  unit?: string;
  min?: number;
  max?: number;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-foreground">
        {label}
        {!required && (
          <span className="ml-1 text-xs text-muted-foreground">
            (任意)
          </span>
        )}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={name}
          name={name}
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          min={min}
          max={max}
          required={required}
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {unit && (
          <span className="shrink-0 text-sm text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// フォーム本体
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fisher-Yates シャッフル（シードベース、同日同ユーザーで同じ順序）
// ---------------------------------------------------------------------------

function seededShuffle<T>(array: T[], seed: number): T[] {
  const shuffled = [...array];
  let s = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    // 簡易 PRNG: xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const j = ((s >>> 0) % (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  return shuffled;
}

function hashSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/** 月経周期フェーズの選択肢 */
const MENSTRUAL_PHASES = [
  { value: '', label: '回答しない' },
  { value: 'menstrual', label: '月経期' },
  { value: 'follicular', label: '卵胞期' },
  { value: 'ovulatory', label: '排卵期' },
  { value: 'luteal', label: '黄体期' },
  { value: 'none', label: '該当なし' },
] as const;

export function CheckinForm({ athleteId, sex, lastCalibrationAt, acwr, readinessScore, recentScores }: CheckinFormProps) {
  // Fatigue Focus Mode: ACWR > 1.3 → 3問に絞り込み
  const isFatigueFocus = (acwr ?? 0) > 1.3;

  // Vigor Mode: Readiness ≥ 80 かつ 3日連続改善
  const isVigorMode = (() => {
    if ((readinessScore ?? 0) < 80) return false;
    if (!recentScores || recentScores.length < 3) return false;
    // 直近3日が連続で改善（各日が前日より高い）
    return recentScores[1]! > recentScores[0]! && recentScores[2]! > recentScores[1]!;
  })();

  // フォーム値
  const [rpe, setRpe] = useState(5);
  const [trainingDuration, setTrainingDuration] = useState("");
  const [sleepScore, setSleepScore] = useState(7);
  const [subjectiveCondition, setSubjectiveCondition] = useState(7);
  const [fatigueSubjective, setFatigueSubjective] = useState(3);
  const [nrs, setNrs] = useState(0);
  const [hrv, setHrv] = useState("");
  const [nsaid24h, setNsaid24h] = useState(false);
  const [menstrualPhase, setMenstrualPhase] = useState("");
  const [calibrationAnchor, setCalibrationAnchor] = useState<number | null>(null);

  // 3ヶ月以上キャリブレーション未実施なら表示
  const showCalibration = (() => {
    if (!lastCalibrationAt) return true; // 一度もやっていない
    const last = new Date(lastCalibrationAt);
    const now = new Date();
    const diffDays = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 90;
  })();

  // 送信状態
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // バリデーション（Fatigue Focus Mode 時はトレーニング時間不要）
    const duration = isFatigueFocus ? 0 : Number(trainingDuration);
    if (!isFatigueFocus && (!trainingDuration || Number.isNaN(duration) || duration < 0)) {
      setError("トレーニング時間を正しく入力してください。");
      return;
    }

    const today = new Date().toISOString().split("T")[0]!;

    const body: Record<string, unknown> = {
      athlete_id: athleteId,
      date: today,
      rpe,
      training_duration_min: duration,
      sleep_score: sleepScore,
      subjective_condition: subjectiveCondition,
      fatigue_subjective: fatigueSubjective,
      nrs,
    };

    if (hrv && !Number.isNaN(Number(hrv)) && Number(hrv) > 0) {
      body.hrv = Number(hrv);
    }

    if (nsaid24h) {
      body.medication_nsaid_24h = true;
    }

    if (menstrualPhase) {
      body.menstrual_phase = menstrualPhase;
    }

    if (calibrationAnchor !== null) {
      body.calibration_anchor = calibrationAnchor;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error ?? "送信に失敗しました。");
        return;
      }

      setResult({
        conditioningScore: json.data.conditioning.conditioningScore,
        fitnessEwma: json.data.conditioning.fitnessEwma,
        fatigueEwma: json.data.conditioning.fatigueEwma,
        acwr: json.data.conditioning.acwr,
      });
    } catch (err) { void err; // silently handled
      setError("ネットワークエラーが発生しました。");
    } finally {
      setSubmitting(false);
    }
  }

  // 送信成功後のスコア即時表示（<1秒）
  if (result) {
    const zone = getConditionZone(result.conditioningScore);
    return (
      <div className="flex flex-col items-center gap-6 pt-4">
        <h2 className="text-lg font-semibold text-foreground">
          チェックイン完了
        </h2>

        <ConditioningRing score={result.conditioningScore} />

        {/* 3カード横並びサマリー */}
        <div className="flex w-full gap-2">
          <div className="flex flex-1 flex-col items-center rounded-xl border border-border bg-card py-3">
            <p className="text-[10px] text-muted-foreground">残り体力 / HP</p>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {Math.round(result.fitnessEwma)}
            </p>
          </div>
          <div className="flex flex-1 flex-col items-center rounded-xl border border-border bg-card py-3">
            <p className="text-[10px] text-muted-foreground">疲労の状態</p>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {Math.round(100 - result.fatigueEwma)}%
            </p>
          </div>
          <div className="flex flex-1 flex-col items-center rounded-xl border border-border bg-card py-3">
            <p className="text-[10px] text-muted-foreground">負荷バランス</p>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {result.acwr.toFixed(2)}
            </p>
          </div>
        </div>

        <a
          href="/home"
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          ホームに戻る
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* エラーメッセージ */}
      {error && (
        <div className="rounded-lg border border-critical-200 bg-critical-50 p-3">
          <p className="text-sm text-critical-700">{error}</p>
        </div>
      )}

      {/* Fatigue Focus Mode バナー */}
      {isFatigueFocus && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm font-semibold text-orange-700">
            🟠 高負荷の翌日です
          </p>
          <p className="mt-1 text-xs text-orange-600">
            3つの質問だけお願いします。無理せず正直に答えてください。
          </p>
        </div>
      )}

      {/* Vigor Mode バナー */}
      {isVigorMode && !isFatigueFocus && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
          <p className="text-sm font-semibold text-teal-700">
            🔵 調子が良いですね！この調子を維持しましょう
          </p>
        </div>
      )}

      {/* キャリブレーション・プロンプト（3ヶ月ごと、Fatigue Focus 時はスキップ） */}
      {showCalibration && !isFatigueFocus && (
        <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4">
          <p className="mb-2 text-sm font-semibold text-primary">
            アンカー再設定
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            直近で最もきつかった練習を 10 として、今日の疲労はどれくらいですか？
            この回答が今後の Z-Score 基準値の再計算に使われます。
          </p>
          <SliderField
            label="キャリブレーション値"
            name="calibration_anchor"
            min={0}
            max={10}
            step={1}
            value={calibrationAnchor ?? 5}
            onChange={(v) => setCalibrationAnchor(v)}
            hint="0=全く疲労なし, 10=最大の疲労"
          />
        </div>
      )}

      {/* ===== Fatigue Focus Mode: 3問のみ ===== */}
      {isFatigueFocus ? (
        <>
          <SliderField
            label="疲労感"
            name="fatigue_subjective"
            min={0}
            max={10}
            step={1}
            value={fatigueSubjective}
            onChange={setFatigueSubjective}
            hint="0=疲労なし, 10=極度の疲労"
          />
          <SliderField
            label="睡眠の質"
            name="sleep_score"
            min={0}
            max={10}
            step={1}
            value={sleepScore}
            onChange={setSleepScore}
            hint="0=非常に悪い, 10=非常に良い"
          />
          <SliderField
            label="痛み NRS"
            name="nrs"
            min={0}
            max={10}
            step={1}
            value={nrs}
            onChange={setNrs}
            hint="0=痛みなし, 10=最大の痛み"
          />
        </>
      ) : (
        <>
          {/* ===== 通常モード: 全質問 ===== */}

          {/* RPE */}
          <SliderField
            label="RPE（主観的運動強度）"
            name="rpe"
            min={0}
            max={10}
            step={1}
            value={rpe}
            onChange={setRpe}
            hint="0=安静, 10=最大努力"
          />

          {/* トレーニング時間 */}
          <NumberField
            label="トレーニング時間"
            name="training_duration"
            value={trainingDuration}
            onChange={setTrainingDuration}
            placeholder="60"
            unit="分"
            min={0}
            required
          />

          {/* 主観スコア（ランダム順序 — Pain NRS は常に最後） */}
          {(() => {
            const today = new Date().toISOString().split("T")[0]!;
            const seed = hashSeed(`${athleteId}-${today}`);
            const shuffleable = [
              <SliderField key="sleep" label="睡眠の質" name="sleep_score" min={0} max={10} step={1} value={sleepScore} onChange={setSleepScore} hint="0=非常に悪い, 10=非常に良い" />,
              <SliderField key="condition" label="主観的体調" name="subjective_condition" min={0} max={10} step={1} value={subjectiveCondition} onChange={setSubjectiveCondition} hint="0=最悪, 10=最高" />,
              <SliderField key="fatigue" label="疲労感" name="fatigue_subjective" min={0} max={10} step={1} value={fatigueSubjective} onChange={setFatigueSubjective} hint="0=疲労なし, 10=極度の疲労" />,
            ];
            const shuffled = seededShuffle(shuffleable, seed);
            return (
              <>
                {shuffled}
                {/* Pain NRS は常に最後（他の回答に影響を与えないため） */}
                <SliderField label="痛み NRS" name="nrs" min={0} max={10} step={1} value={nrs} onChange={setNrs} hint="0=痛みなし, 10=最大の痛み" />
              </>
            );
          })()}

          {/* HRV (任意) */}
          <NumberField
            label="HRV"
            name="hrv"
            value={hrv}
            onChange={setHrv}
            placeholder="例: 65"
            unit="ms"
            min={0}
          />

          {/* 月経周期フェーズ（女性アスリートのみ） */}
          {sex === 'female' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="menstrual_phase" className="text-sm font-medium text-foreground">
                月経周期フェーズ
                <span className="ml-1 text-xs text-muted-foreground">(任意)</span>
              </label>
              <select
                id="menstrual_phase"
                name="menstrual_phase"
                value={menstrualPhase}
                onChange={(e) => setMenstrualPhase(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {MENSTRUAL_PHASES.map((phase) => (
                  <option key={phase.value} value={phase.value}>
                    {phase.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* NSAID 鎮痛剤チェック */}
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={nsaid24h}
              onChange={(e) => setNsaid24h(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
            />
            <span className="text-sm text-foreground">
              過去24時間以内に痛み止め（NSAIDなど）を服用した
              <span className="ml-1 text-xs text-muted-foreground">
                （痛み NRS の安全判定に影響します）
              </span>
            </span>
          </label>
        </>
      )}

      {/* 送信ボタン */}
      <button
        type="submit"
        disabled={submitting}
        className="mt-2 h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "送信中..." : "チェックインする"}
      </button>
    </form>
  );
}
