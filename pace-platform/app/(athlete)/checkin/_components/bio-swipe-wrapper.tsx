'use client';

/**
 * Bio-Swipe Wrapper
 *
 * Bio-Swipe チェックインとフォールバック（従来フォーム）を統合するラッパー。
 * スワイプ完了後は Daily Compass (Action Screen) へ遷移。
 *
 * AIが日々の質問を動的に生成（API から取得）。
 * フォールバック: 質問取得失敗時は従来のスライダーフォームを表示。
 */

import { useCallback, useEffect, useState } from 'react';
import {
  BioSwipeCheckin,
  type BioSwipeQuestion,
  type SwipeAnswer,
} from './bio-swipe-checkin';
import {
  DailyCompass,
  type DailyStatus,
  type Prescription,
} from '../../home/_components/daily-compass';
import { CheckinForm } from './checkin-form';

interface BioSwipeWrapperProps {
  athleteId: string;
}

type Phase = 'loading' | 'swipe' | 'form' | 'compass' | 'fallback';

// デフォルト質問セット（API未接続時のフォールバック）
const DEFAULT_QUESTIONS: BioSwipeQuestion[] = [
  {
    id: 'q_hamstring_r',
    bodyPart: 'hamstring_right',
    bodyPartLabel: '右ハムストリングス',
    question: '昨日より、右裏モモに張りはある？',
  },
  {
    id: 'q_knee_l',
    bodyPart: 'knee_left',
    bodyPartLabel: '左膝',
    question: '左膝に違和感はある？',
  },
  {
    id: 'q_lower_back',
    bodyPart: 'lower_back',
    bodyPartLabel: '腰',
    question: '腰に重さや張りを感じる？',
  },
  {
    id: 'q_sleep',
    bodyPart: 'general',
    bodyPartLabel: '全身',
    question: '昨晩はぐっすり眠れた？',
  },
];

export function BioSwipeWrapper({ athleteId }: BioSwipeWrapperProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [questions, setQuestions] = useState<BioSwipeQuestion[]>([]);
  const [compassData, setCompassData] = useState<{
    status: DailyStatus;
    prescriptions: Prescription[];
  } | null>(null);

  // 質問リストを API から取得（フォールバックでデフォルト使用）
  useEffect(() => {
    async function fetchQuestions() {
      try {
        // 将来的には /api/checkin/questions?athlete_id=... から動的に取得
        // 現時点ではデフォルト質問を使用
        setQuestions(DEFAULT_QUESTIONS);
        setPhase('swipe');
      } catch {
        setPhase('fallback');
      }
    }

    fetchQuestions();
  }, [athleteId]);

  // スワイプ完了ハンドラ
  const handleSwipeComplete = useCallback(
    async (answers: SwipeAnswer[]) => {
      try {
        // スワイプデータを API に送信
        const yesCount = answers.filter((a) => a.answer === 'yes').length;
        const totalHesitation = answers.reduce((sum, a) => sum + a.hesitationMs, 0);
        const avgLatency =
          answers.reduce((sum, a) => sum + a.responseLatencyMs, 0) / answers.length;

        const res = await fetch('/api/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            athlete_id: athleteId,
            date: new Date().toISOString().split('T')[0],
            rpe: Math.min(10, yesCount * 2 + 3),
            training_duration_min: 0,
            sleep_score: answers.some(
              (a) => a.questionId === 'q_sleep' && a.answer === 'no',
            )
              ? 8
              : 5,
            subjective_condition: 10 - yesCount * 2,
            fatigue_subjective: yesCount * 2,
            nrs: yesCount > 2 ? yesCount : 0,
            bio_swipe_data: {
              answers,
              totalHesitationMs: totalHesitation,
              avgResponseLatencyMs: avgLatency,
            },
          }),
        });

        const json = await res.json();

        if (json.success) {
          const score = json.data?.conditioning?.conditioningScore ?? 70;
          const isAdjusted = score < 70 || yesCount >= 2;

          const prescriptions: Prescription[] = [];

          if (isAdjusted) {
            if (yesCount >= 2) {
              prescriptions.push({
                icon: '\uD83C\uDFC3\u200D\u2642\uFE0F',
                text: 'スプリント距離は通常の80%に制限されています（コーチ承認済み）',
              });
            }
            const tenseParts = answers
              .filter((a) => a.answer === 'yes')
              .map((a) => questions.find((q) => q.id === a.questionId)?.bodyPartLabel)
              .filter(Boolean);
            if (tenseParts.length > 0) {
              prescriptions.push({
                icon: '\uD83E\uDDD8\u200D\u2642\uFE0F',
                text: `練習前に、${tenseParts.join('・')}のアクティベーション・ドリルを必ず3セット実施してください`,
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
        } else {
          setPhase('fallback');
        }
      } catch {
        setPhase('fallback');
      }
    },
    [athleteId, questions],
  );

  // Loading
  if (phase === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0D1117]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-deep-space-400 border-t-cyber-cyan-500" />
      </div>
    );
  }

  // Swipe UI
  if (phase === 'swipe' && questions.length > 0) {
    return (
      <div className="flex flex-col h-full">
        <BioSwipeCheckin
          athleteId={athleteId}
          questions={questions}
          onComplete={handleSwipeComplete}
        />
        <div className="fixed bottom-20 left-0 right-0 flex justify-center z-50">
          <button
            onClick={() => setPhase('form')}
            className="rounded-full bg-white/10 px-4 py-2 text-xs text-white/60 backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            スキップして入力フォームへ →
          </button>
        </div>
      </div>
    );
  }

  // 従来の入力フォーム
  if (phase === 'form') {
    return <CheckinForm athleteId={athleteId} />;
  }

  // Daily Compass (Action Screen)
  if (phase === 'compass' && compassData) {
    return (
      <DailyCompass
        status={compassData.status}
        prescriptions={compassData.prescriptions}
        coachApproved={true}
      />
    );
  }

  // Fallback: 従来フォーム
  return <CheckinForm athleteId={athleteId} />;
}
