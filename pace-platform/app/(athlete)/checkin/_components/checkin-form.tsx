"use client";

/**
 * チェックインフォーム
 *
 * RPE, トレーニング時間, 睡眠の質, 主観的体調, 疲労感, 痛み NRS, HRV を入力。
 * POST /api/checkin に送信後、コンディショニングスコアを表示。
 */

import { useState } from "react";
import { ConditioningRing } from "../../home/_components/conditioning-ring";

interface CheckinFormProps {
  athleteId: string;
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

export function CheckinForm({ athleteId }: CheckinFormProps) {
  // フォーム値
  const [rpe, setRpe] = useState(5);
  const [trainingDuration, setTrainingDuration] = useState("");
  const [sleepScore, setSleepScore] = useState(7);
  const [subjectiveCondition, setSubjectiveCondition] = useState(7);
  const [fatigueSubjective, setFatigueSubjective] = useState(3);
  const [nrs, setNrs] = useState(0);
  const [hrv, setHrv] = useState("");

  // 送信状態
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // バリデーション
    const duration = Number(trainingDuration);
    if (!trainingDuration || Number.isNaN(duration) || duration < 0) {
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
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setSubmitting(false);
    }
  }

  // 送信成功後のスコア表示
  if (result) {
    return (
      <div className="flex flex-col items-center gap-6 pt-4">
        <h2 className="text-lg font-semibold text-foreground">
          チェックイン完了
        </h2>

        <ConditioningRing score={result.conditioningScore} />

        <div className="w-full rounded-xl border border-border bg-card p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">フィットネス</p>
              <p className="text-lg font-bold tabular-nums text-foreground">
                {result.fitnessEwma.toFixed(1)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">疲労</p>
              <p className="text-lg font-bold tabular-nums text-foreground">
                {result.fatigueEwma.toFixed(1)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ACWR</p>
              <p className="text-lg font-bold tabular-nums text-foreground">
                {result.acwr.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setResult(null)}
          className="rounded-lg bg-secondary px-6 py-2.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          もう一度入力する
        </button>
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

      {/* 睡眠の質 */}
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

      {/* 主観的体調 */}
      <SliderField
        label="主観的体調"
        name="subjective_condition"
        min={0}
        max={10}
        step={1}
        value={subjectiveCondition}
        onChange={setSubjectiveCondition}
        hint="0=最悪, 10=最高"
      />

      {/* 疲労感 */}
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

      {/* 痛み NRS */}
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
