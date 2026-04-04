'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { QuestionPanel } from './question-panel';
import { PosteriorPanel } from './posterior-panel';
import { RedFlagModal } from './red-flag-modal';
import { AssessmentResult } from './assessment-result';
import type {
  AnswerValue,
  AssessmentResult as AssessmentResultType,
  AssessmentSession as AssessmentSessionType,
  NextQuestionResult,
  PosteriorResult,
  RedFlagResult,
} from '@/lib/assessment/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnswerHistoryItem {
  nodeId: string;
  questionText: string;
  answer: AnswerValue;
}

interface AssessmentSessionProps {
  paramsPromise: Promise<{ assessmentId: string }>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AssessmentSession({ paramsPromise }: AssessmentSessionProps) {
  const { assessmentId } = use(paramsPromise);

  const [currentQuestion, setCurrentQuestion] = useState<NextQuestionResult | null>(null);
  const [posteriors, setPosteriors] = useState<PosteriorResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [result, setResult] = useState<AssessmentResultType | null>(null);
  const [answerHistory, setAnswerHistory] = useState<AnswerHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [athleteName, setAthleteName] = useState('');
  const [totalNodes, setTotalNodes] = useState(25);
  const [redFlag, setRedFlag] = useState<RedFlagResult | null>(null);
  const [showRedFlagModal, setShowRedFlagModal] = useState(false);

  const questionEndRef = useRef<HTMLDivElement>(null);

  // Initial fetch — get session status
  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch(`/api/assessment/${assessmentId}`);
        const json = await res.json();

        if (!json.success) {
          setError(json.error ?? 'セッションの取得に失敗しました。');
          return;
        }

        const { session, result: savedResult } = json.data as {
          session: AssessmentSessionType;
          result: AssessmentResultType | null;
        };

        // Reconstruct answer history from saved responses
        const history: AnswerHistoryItem[] = session.responses.map((r) => ({
          nodeId: r.nodeId,
          questionText: '', // question text not stored in responses
          answer: r.answer,
        }));
        setAnswerHistory(history);

        // Convert posteriors map to sorted array
        const posteriorArray: PosteriorResult[] = Object.entries(
          session.posteriors,
        )
          .map(([code, prob]) => ({
            diagnosisCode: code,
            probability: prob,
            confidence: [0, 0] as [number, number],
            isRedFlag: false,
          }))
          .sort((a, b) => b.probability - a.probability)
          .slice(0, 5);
        setPosteriors(posteriorArray);

        if (
          session.status === 'completed' ||
          session.status === 'terminated_red_flag'
        ) {
          setIsComplete(true);
          setResult(savedResult);
        } else if (session.currentNodeId) {
          // Session is in progress, need to get current question from answer API
          // For now, show a prompt to continue
          setCurrentQuestion({
            nodeId: session.currentNodeId,
            questionText: '前回の続きから再開します。',
            informationGain: 0,
            progress: history.length > 0 ? (history.length / totalNodes) * 100 : 0,
          });
          setProgress(
            history.length > 0 ? (history.length / totalNodes) * 100 : 0,
          );
        }
      } catch (err) { void err; // silently handled
        setError('ネットワークエラーが発生しました。');
      } finally {
        setLoading(false);
      }
    }

    fetchSession();
  }, [assessmentId, totalNodes]);

  // Handle answer submission
  const handleAnswer = useCallback(
    async (answer: AnswerValue) => {
      if (!currentQuestion || submitting) return;

      setSubmitting(true);
      setError(null);

      try {
        const res = await fetch(`/api/assessment/${assessmentId}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeId: currentQuestion.nodeId,
            answer,
          }),
        });

        const json = await res.json();

        if (!json.success) {
          setError(json.error ?? '回答の送信に失敗しました。');
          return;
        }

        const data = json.data as {
          nextQuestion: NextQuestionResult | null;
          posteriors: PosteriorResult[];
          progress: number;
          isComplete: boolean;
          result: AssessmentResultType | null;
          redFlag: RedFlagResult | null;
        };

        // Add to history
        setAnswerHistory((prev) => [
          ...prev,
          {
            nodeId: currentQuestion.nodeId,
            questionText: currentQuestion.questionText,
            answer,
          },
        ]);

        setPosteriors(data.posteriors);
        setProgress(data.progress);

        // Check red flags
        if (data.redFlag) {
          setRedFlag(data.redFlag);
          setShowRedFlagModal(true);
        }

        if (data.isComplete) {
          setIsComplete(true);
          setResult(data.result);
          setCurrentQuestion(null);
        } else {
          setCurrentQuestion(data.nextQuestion);
          // Auto-scroll to new question
          setTimeout(() => {
            questionEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      } catch (err) { void err; // silently handled
        setError('ネットワークエラーが発生しました。');
      } finally {
        setSubmitting(false);
      }
    },
    [assessmentId, currentQuestion, submitting],
  );

  // Handle red flag modal actions
  const handleApplyHardLock = useCallback(() => {
    setShowRedFlagModal(false);
    // Hard lock applied by backend; session will be terminated
  }, []);

  const handleContinueAfterRedFlag = useCallback(() => {
    setShowRedFlagModal(false);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="h-8 w-8 animate-spin text-primary"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="text-sm text-muted-foreground">
            アセスメントを読み込み中...
          </p>
        </div>
      </div>
    );
  }

  // Error state (only when we have no other content)
  if (error && !currentQuestion && !isComplete) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-critical-200 bg-critical-50 p-6 text-center">
        <p className="text-sm font-medium text-critical-700">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 rounded-md bg-critical-600 px-4 py-2 text-sm text-white hover:bg-critical-700"
        >
          再読み込み
        </button>
      </div>
    );
  }

  // Completed state
  if (isComplete && result) {
    return (
      <AssessmentResult
        result={result}
        athleteName={athleteName}
        assessmentId={assessmentId}
      />
    );
  }

  // Active assessment — split panel
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">
          アセスメント {athleteName ? `— ${athleteName}` : ''}
        </h1>
        <span className="text-xs text-muted-foreground">
          セッション: {assessmentId.slice(0, 8)}...
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {/* Left panel: Question */}
        <QuestionPanel
          assessmentId={assessmentId}
          currentQuestion={currentQuestion}
          responseCount={answerHistory.length}
          estimatedTotal={totalNodes}
          progress={progress}
          onAnswer={handleAnswer}
          submitting={submitting}
          answerHistory={answerHistory}
        />

        {/* Right panel: Posteriors */}
        <PosteriorPanel posteriors={posteriors} />
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-critical-200 bg-critical-50 px-4 py-3 shadow-lg">
          <p className="text-sm text-critical-700">{error}</p>
        </div>
      )}

      {/* Red flag modal */}
      {showRedFlagModal && redFlag && (
        <RedFlagModal
          redFlag={redFlag}
          onApplyHardLock={handleApplyHardLock}
          onContinue={handleContinueAfterRedFlag}
        />
      )}

      <div ref={questionEndRef} />
    </>
  );
}
