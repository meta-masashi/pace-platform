'use client';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface Gate {
  id: string;
  phase: number;
  gate_met_at: string | null;
}

interface PhaseStepperProps {
  /** 現在のフェーズ（1〜4） */
  currentPhase: number;
  /** フェーズゲート一覧 */
  gates: Gate[];
  /** プログラムステータス */
  status: string;
}

/** フェーズラベル定義 */
const PHASE_LABELS = [
  { phase: 1, label: '急性期' },
  { phase: 2, label: '回復期' },
  { phase: 3, label: '機能回復期' },
  { phase: 4, label: '復帰準備期' },
  { phase: 5, label: 'RTP' },
];

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * フェーズステッパーコンポーネント
 *
 * 4 フェーズ + RTP を水平タイムラインで表示する。
 * - 完了フェーズ: エメラルド塗りつぶし + チェックアイコン
 * - 現在フェーズ: エメラルド塗りつぶし + パルスアニメーション
 * - 未到達フェーズ: グレーアウトライン
 */
export function PhaseStepper({ currentPhase, gates, status }: PhaseStepperProps) {
  const isCompleted = status === 'completed';

  /** フェーズのゲートが通過済みかどうか */
  const isGateMet = (phase: number) => {
    const gate = gates.find((g) => g.phase === phase);
    return gate?.gate_met_at != null;
  };

  /** 各ステップの状態を決定 */
  const getStepState = (phase: number): 'completed' | 'current' | 'future' => {
    if (phase === 5) {
      // RTP ステップ
      return isCompleted ? 'completed' : 'future';
    }
    if (isCompleted || phase < currentPhase) return 'completed';
    if (phase === currentPhase) return 'current';
    return 'future';
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">フェーズ進行状況</h2>

      <div className="flex items-center justify-between">
        {PHASE_LABELS.map((step, index) => {
          const state = getStepState(step.phase);
          const isLast = index === PHASE_LABELS.length - 1;

          return (
            <div key={step.phase} className="flex flex-1 items-center">
              {/* ステップノード */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  {/* SVG 円 */}
                  <svg
                    className={`h-10 w-10 ${state === 'current' ? 'animate-pulse' : ''}`}
                    viewBox="0 0 40 40"
                  >
                    <circle
                      cx="20"
                      cy="20"
                      r="18"
                      fill={
                        state === 'completed'
                          ? '#10b981'
                          : state === 'current'
                            ? '#10b981'
                            : 'transparent'
                      }
                      stroke={
                        state === 'future' ? '#d1d5db' : '#10b981'
                      }
                      strokeWidth="2"
                    />
                    {/* 完了チェックアイコン */}
                    {state === 'completed' && (
                      <path
                        d="M13 20l4 4 10-10"
                        fill="none"
                        stroke="white"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {/* 現在フェーズ番号 */}
                    {state === 'current' && (
                      <text
                        x="20"
                        y="20"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="white"
                        fontSize="14"
                        fontWeight="bold"
                      >
                        {step.phase <= 4 ? step.phase : ''}
                      </text>
                    )}
                    {/* 未来フェーズ番号 */}
                    {state === 'future' && (
                      <text
                        x="20"
                        y="20"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#9ca3af"
                        fontSize="14"
                        fontWeight="bold"
                      >
                        {step.phase <= 4 ? step.phase : ''}
                      </text>
                    )}
                  </svg>

                  {/* ゲート通過バッジ（フェーズ1-4のみ） */}
                  {step.phase <= 4 && isGateMet(step.phase) && (
                    <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white dark:ring-card">
                      <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* ラベル */}
                <span
                  className={`mt-2 text-xs font-medium ${
                    state === 'completed'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : state === 'current'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* 接続線 */}
              {!isLast && (
                <div className="mx-2 h-0.5 flex-1">
                  <div
                    className={`h-full ${
                      (() => {
                        const next = PHASE_LABELS[index + 1];
                        return next ? getStepState(next.phase) !== 'future' : false;
                      })()
                        ? 'bg-emerald-500'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
