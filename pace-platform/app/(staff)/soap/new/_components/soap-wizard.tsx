'use client';

/**
 * SOAP Wizard — ステップ型 SOAP ノート作成フォーム
 *
 * 4フィールドを1画面1項目のステップ式で入力。
 * モバイルでの操作性を大幅に改善。
 */

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AiGenerateButton } from './ai-generate-button';

const STEPS = [
  {
    key: 's' as const,
    label: 'S',
    title: 'Subjective（主観的所見）',
    hint: '選手の訴え・自覚症状を記録',
    placeholder: '「右膝の内側が練習後に痛む」「昨日から腰に違和感」など',
  },
  {
    key: 'o' as const,
    label: 'O',
    title: 'Objective（客観的所見）',
    hint: '検査結果・測定値・観察所見を記録',
    placeholder: '「膝関節ROM: 屈曲130°/伸展0°」「圧痛(+) 内側側副靭帯」など',
  },
  {
    key: 'a' as const,
    label: 'A',
    title: 'Assessment（評価）',
    hint: '臨床的判断・診断仮説を記録',
    placeholder: '「MCL Grade I sprain の疑い」「オーバーユースによる腰部筋スパズム」など',
  },
  {
    key: 'p' as const,
    label: 'P',
    title: 'Plan（計画）',
    hint: '治療計画・リハビリプラン・フォロー予定を記録',
    placeholder: '「RICE処置継続」「翌日再評価」「段階的RTP 1週間プラン開始」など',
  },
] as const;

type FieldKey = (typeof STEPS)[number]['key'];

export function SoapWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const athleteId = searchParams.get('athleteId') ?? '';

  const [step, setStep] = useState(0);
  const [fields, setFields] = useState<Record<FieldKey, string>>({
    s: '',
    o: '',
    a: '',
    p: '',
  });
  const [aiGenerated, setAiGenerated] = useState<Record<FieldKey, boolean>>({
    s: false,
    o: false,
    a: false,
    p: false,
  });
  const [fieldLoading, setFieldLoading] = useState<Record<FieldKey, boolean>>({
    s: false,
    o: false,
    a: false,
    p: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isReview = step === STEPS.length;
  const currentStep = STEPS[step];

  const updateField = useCallback((key: FieldKey, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  // AI 生成
  const handleAiGenerate = useCallback(
    async (key: FieldKey) => {
      if (!athleteId) {
        setError('選手IDが指定されていません。');
        return;
      }
      setFieldLoading((prev) => ({ ...prev, [key]: true }));
      try {
        const res = await fetch('/api/soap/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            athleteId,
            section: key.toUpperCase(),
            existingFields: fields,
          }),
        });
        const json = await res.json();
        if (json.success && json.data?.text) {
          updateField(key, json.data.text);
          setAiGenerated((prev) => ({ ...prev, [key]: true }));
        }
      } catch (err) { void err; // silently handled
        setError('AI生成に失敗しました。');
      } finally {
        setFieldLoading((prev) => ({ ...prev, [key]: false }));
      }
    },
    [athleteId, fields, updateField],
  );

  // 送信
  const handleSubmit = useCallback(async () => {
    if (!athleteId) {
      setError('選手IDが指定されていません。');
      return;
    }
    if (fields.s.length < 10) {
      setError('主観的所見は10文字以上入力してください。');
      setStep(0);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/soap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId,
          sText: fields.s,
          oText: fields.o,
          aText: fields.a,
          pText: fields.p,
          aiAssisted: Object.values(aiGenerated).some(Boolean),
        }),
      });
      const json = await res.json();
      if (json.success) {
        router.push(`/athletes/${athleteId}`);
      } else {
        setError(json.error ?? '保存に失敗しました。');
      }
    } catch (err) { void err; // silently handled
      setError('ネットワークエラーが発生しました。');
    } finally {
      setSaving(false);
    }
  }, [athleteId, fields, aiGenerated, router]);

  return (
    <div className="mx-auto max-w-lg">
      {/* 進捗ドット */}
      <div className="mb-6 flex items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setStep(i)}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
              i === step
                ? 'bg-primary text-primary-foreground scale-110'
                : i < step || isReview
                  ? 'bg-primary/20 text-primary'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => setStep(STEPS.length)}
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
            isReview
              ? 'bg-primary text-primary-foreground scale-110'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          ✓
        </button>
      </div>

      {/* エラー */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ステップ入力 */}
      {!isReview && currentStep && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">
              {currentStep.label}
            </span>
            <h2 className="text-sm font-semibold text-foreground">
              {currentStep.title}
            </h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{currentStep.hint}</p>

          <textarea
            value={fields[currentStep.key]}
            onChange={(e) => updateField(currentStep.key, e.target.value)}
            placeholder={currentStep.placeholder}
            rows={6}
            className={`w-full resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
              aiGenerated[currentStep.key]
                ? 'border-amber-300 bg-amber-50'
                : 'border-input bg-background'
            }`}
          />

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {fields[currentStep.key].length} 文字
            </span>
            <AiGenerateButton
              onClick={() => handleAiGenerate(currentStep.key)}
              loading={fieldLoading[currentStep.key]}
              label={`AI で ${currentStep.label} を生成`}
              disabled={!athleteId}
            />
          </div>
        </div>
      )}

      {/* レビュー */}
      {isReview && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">確認して送信</h2>
          {STEPS.map((s) => (
            <div
              key={s.key}
              className="rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary">{s.label}</span>
                {aiGenerated[s.key] && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                    AI生成
                  </span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {fields[s.key] || '(未入力)'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ナビゲーション */}
      <div className="mt-5 flex justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:invisible"
        >
          ← 戻る
        </button>

        {isReview ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? '保存中...' : 'SOAPノートを保存'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
            className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            次へ →
          </button>
        )}
      </div>

      {/* 免責 */}
      <p className="mt-6 text-center text-[10px] text-muted-foreground">
        AI生成コンテンツは参考情報です。最終的な判断は有資格者が行ってください。
      </p>
    </div>
  );
}
