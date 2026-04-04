'use client';

/**
 * Simple Check-in — 3ステップのタップ式チェックイン
 *
 * デザイン原則:
 * - ゼロ学習コスト（信号機メタファー）
 * - 1画面1アクション
 * - ライトモード基本、朝の目に優しい配色
 * - フルスクリーンで集中、完了後に自動で Daily Compass へ
 */

import { useCallback, useState } from 'react';
import {
  DailyCompass,
  type DailyStatus,
  type Prescription,
} from '../../home/_components/daily-compass';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Condition = 'good' | 'ok' | 'tough';
type Phase = 'step1' | 'step2' | 'step3' | 'submitting' | 'compass';

interface SimpleCheckinProps {
  athleteId: string;
}

interface PainPart {
  id: string;
  label: string;
}

const PAIN_PARTS: PainPart[] = [
  { id: 'neck_shoulder', label: '首・肩' },
  { id: 'lower_back', label: '腰' },
  { id: 'thigh', label: '太もも' },
  { id: 'knee', label: '膝' },
  { id: 'calf', label: '脛・ふくらはぎ' },
  { id: 'ankle', label: '足首' },
  { id: 'other', label: 'その他' },
];

// 軽い触覚フィードバック
function haptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(10);
  }
}

// ---------------------------------------------------------------------------
// 共通: プログレスバー
// ---------------------------------------------------------------------------

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i < current ? 'bg-emerald-500' : 'bg-slate-200'
          }`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function SimpleCheckin({ athleteId }: SimpleCheckinProps) {
  const [phase, setPhase] = useState<Phase>('step1');
  const [condition, setCondition] = useState<Condition | null>(null);
  const [painParts, setPainParts] = useState<string[]>([]);
  const [sleep, setSleep] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compassData, setCompassData] = useState<{
    status: DailyStatus;
    prescriptions: Prescription[];
  } | null>(null);

  // Step 1: コンディション選択
  const handleCondition = useCallback((c: Condition) => {
    haptic();
    setCondition(c);
    setPhase('step2');
  }, []);

  // Step 2: 部位トグル
  const togglePart = useCallback((id: string) => {
    haptic();
    setPainParts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  // Step 2: 「なし」選択
  const handleNoPain = useCallback(() => {
    haptic();
    setPainParts([]);
    setPhase('step3');
  }, []);

  // Step 2: 「次へ」
  const handleStep2Next = useCallback(() => {
    haptic();
    setPhase('step3');
  }, []);

  // Step 3: 睡眠選択 → 送信
  const handleSubmit = useCallback(
    async (sleepScore: number) => {
      haptic();
      setSleep(sleepScore);
      setPhase('submitting');
      setError(null);

      try {
        // 値のマッピング
        const conditionScore =
          condition === 'good' ? 10 : condition === 'ok' ? 6 : 3;
        const fatigue =
          condition === 'good' ? 1 : condition === 'ok' ? 4 : 7;
        const nrs =
          painParts.length === 0
            ? 0
            : Math.min(10, 2 + painParts.length * 2);
        const sleepFinal = sleepScore * 2; // 1-5 → 2,4,6,8,10

        const res = await fetch('/api/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            athlete_id: athleteId,
            date: new Date().toISOString().split('T')[0],
            rpe: fatigue,
            training_duration_min: 0,
            sleep_score: sleepFinal,
            subjective_condition: conditionScore,
            fatigue_subjective: fatigue,
            nrs,
          }),
        });

        const json = await res.json();

        if (!json.success) {
          setError('記録に失敗しました。もう一度お試しください。');
          setPhase('step3');
          return;
        }

        // 処方の生成
        const isAdjusted = condition !== 'good' || painParts.length >= 1;
        const prescriptions: Prescription[] = [];

        if (isAdjusted) {
          if (painParts.length >= 2) {
            prescriptions.push({
              icon: '\uD83C\uDFC3\u200D\u2642\uFE0F',
              text: '練習強度を通常の80%に調整してください（コーチ承認済み）',
            });
          }
          if (painParts.length > 0) {
            const labels = painParts
              .map((id) => PAIN_PARTS.find((p) => p.id === id)?.label)
              .filter(Boolean)
              .join('・');
            prescriptions.push({
              icon: '\uD83E\uDDD8\u200D\u2642\uFE0F',
              text: `練習前に、${labels}のアクティベーション・ドリルを3セット実施`,
            });
          }
          if (condition === 'tough') {
            prescriptions.push({
              icon: '\uD83D\uDECC',
              text: '今日は無理せず、コーチに相談してから練習を開始してください',
            });
          }
        } else {
          prescriptions.push({
            icon: '\u2705',
            text: '通常トレーニングを継続してください。制限はありません。',
          });
        }

        setCompassData({
          status: isAdjusted ? 'ADJUSTED' : 'CLEAR',
          prescriptions,
        });
        setPhase('compass');
      } catch {
        setError('通信エラーが発生しました。もう一度お試しください。');
        setPhase('step3');
      }
    },
    [athleteId, condition, painParts],
  );

  // -------------------------------------------------------------------------
  // Compass 表示
  // -------------------------------------------------------------------------
  if (phase === 'compass' && compassData) {
    return (
      <DailyCompass
        status={compassData.status}
        prescriptions={compassData.prescriptions}
        coachApproved={true}
      />
    );
  }

  // -------------------------------------------------------------------------
  // チェックイン UI（全画面オーバーレイ）
  // -------------------------------------------------------------------------
  const stepNum = phase === 'step1' ? 1 : phase === 'step2' ? 2 : 3;

  // 親レイアウト (max-w-[430px], pb-20, pt-6, px-4) の中で流れるフォーム
  // ボトムナビ(56px) + レイアウト余白(24+80=104px) を差し引いた高さを確保
  return (
    <div className="-mx-4 -mt-6 flex min-h-[calc(100dvh-80px)] flex-col bg-white">
      {/* ヘッダー: プログレス */}
      <div className="px-5 pb-3 pt-4">
        <ProgressBar current={stepNum} total={3} />
        <p className="mt-2 text-center text-[11px] font-medium text-slate-500">
          {stepNum} / 3
        </p>
      </div>

      {/* コンテンツ */}
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step 1: コンディション */}
        {phase === 'step1' && (
          <>
            <div className="mb-8 mt-4">
              <h1 className="text-2xl font-bold text-slate-900">
                おはよう！
              </h1>
              <p className="mt-2 text-base text-slate-600">
                今日の調子はどう？
              </p>
            </div>

            <div className="flex flex-1 flex-col justify-center gap-4">
              <button
                type="button"
                onClick={() => handleCondition('good')}
                className="flex min-h-[72px] items-center gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-6 py-5 text-left transition-all active:scale-[0.98] active:bg-emerald-100"
              >
                <span className="text-4xl" aria-hidden>
                  🟢
                </span>
                <div>
                  <p className="text-lg font-bold text-emerald-900">絶好調</p>
                  <p className="text-xs text-emerald-700">
                    体が軽い・元気いっぱい
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleCondition('ok')}
                className="flex min-h-[72px] items-center gap-3 rounded-2xl border-2 border-amber-200 bg-amber-50 px-6 py-5 text-left transition-all active:scale-[0.98] active:bg-amber-100"
              >
                <span className="text-4xl" aria-hidden>
                  🟡
                </span>
                <div>
                  <p className="text-lg font-bold text-amber-900">まぁまぁ</p>
                  <p className="text-xs text-amber-700">
                    いつも通り・普通
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleCondition('tough')}
                className="flex min-h-[72px] items-center gap-3 rounded-2xl border-2 border-rose-200 bg-rose-50 px-6 py-5 text-left transition-all active:scale-[0.98] active:bg-rose-100"
              >
                <span className="text-4xl" aria-hidden>
                  🔴
                </span>
                <div>
                  <p className="text-lg font-bold text-rose-900">きつい</p>
                  <p className="text-xs text-rose-700">
                    疲れてる・だるい
                  </p>
                </div>
              </button>
            </div>
          </>
        )}

        {/* Step 2: 痛み部位 */}
        {phase === 'step2' && (
          <>
            <div className="mb-6 mt-4">
              <h1 className="text-2xl font-bold text-slate-900">
                痛い・違和感のある所は？
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                複数選べます
              </p>
            </div>

            <div className="flex flex-1 flex-wrap content-start gap-2 pb-6">
              {PAIN_PARTS.map((part) => {
                const selected = painParts.includes(part.id);
                return (
                  <button
                    key={part.id}
                    type="button"
                    onClick={() => togglePart(part.id)}
                    className={`min-h-[48px] rounded-full border-2 px-5 py-2.5 text-sm font-medium transition-all active:scale-95 ${
                      selected
                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-md'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {selected && <span className="mr-1">✓</span>}
                    {part.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-3">
              {painParts.length > 0 ? (
                <button
                  type="button"
                  onClick={handleStep2Next}
                  className="min-h-[56px] rounded-2xl bg-emerald-600 px-6 py-4 text-base font-bold text-white shadow-md transition-all active:scale-[0.98] active:bg-emerald-700"
                >
                  次へ → ({painParts.length}箇所選択中)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNoPain}
                  className="min-h-[56px] rounded-2xl bg-emerald-600 px-6 py-4 text-base font-bold text-white shadow-md transition-all active:scale-[0.98] active:bg-emerald-700"
                >
                  なし ✓
                </button>
              )}
            </div>
          </>
        )}

        {/* Step 3: 睡眠 */}
        {(phase === 'step3' || phase === 'submitting') && (
          <>
            <div className="mb-8 mt-4">
              <h1 className="text-2xl font-bold text-slate-900">
                昨晩はよく眠れた？
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                5段階で教えてください
              </p>
            </div>

            <div className="flex flex-1 flex-col justify-center">
              <div className="grid grid-cols-5 gap-2">
                {[
                  { value: 1, emoji: '😴', label: '全然' },
                  { value: 2, emoji: '😪', label: 'あまり' },
                  { value: 3, emoji: '😐', label: '普通' },
                  { value: 4, emoji: '🙂', label: 'まぁまぁ' },
                  { value: 5, emoji: '😃', label: 'ぐっすり' },
                ].map((item) => {
                  const selected = sleep === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      disabled={phase === 'submitting'}
                      onClick={() => handleSubmit(item.value)}
                      className={`flex min-h-[96px] flex-col items-center justify-center gap-1 rounded-2xl border-2 p-2 transition-all active:scale-95 disabled:opacity-50 ${
                        selected
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="text-3xl" aria-hidden>
                        {item.emoji}
                      </span>
                      <span className="text-[10px] font-medium text-slate-600">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {phase === 'submitting' && (
                <div className="mt-8 flex items-center justify-center gap-3 text-sm text-slate-600">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                  記録中...
                </div>
              )}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
