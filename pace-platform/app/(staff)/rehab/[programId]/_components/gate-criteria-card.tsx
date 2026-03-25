'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface Gate {
  id: string;
  phase: number;
  gate_criteria_json: Record<string, unknown>;
  gate_met_at: string | null;
  verified_by_staff_id: string | null;
  staff: { name: string } | null;
}

interface GateCriteriaCardProps {
  /** プログラムID */
  programId: string;
  /** 現在フェーズのゲート情報 */
  gate: Gate;
  /** 現在フェーズ */
  currentPhase: number;
  /** ゲート通過後のコールバック */
  onGateVerified: () => void;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * ゲート基準カードコンポーネント
 *
 * 現在フェーズのゲート基準をチェックリスト形式で表示する。
 * Leader フラグまたは master ロールのみが「ゲート通過確認」を実行可能。
 */
export function GateCriteriaCard({
  programId,
  gate,
  currentPhase,
  onGateVerified,
}: GateCriteriaCardProps) {
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  /** ゲート基準リストを取得 */
  const criteriaList = (() => {
    const json = gate.gate_criteria_json;
    if (Array.isArray(json)) return json.map(String);
    if (json && typeof json === 'object' && 'criteria' in json) {
      const c = (json as { criteria: unknown }).criteria;
      if (Array.isArray(c)) return c.map(String);
    }
    return [`フェーズ${currentPhase}のゲート基準`];
  })();

  /** すでにゲート通過済みか */
  const isAlreadyMet = gate.gate_met_at != null;

  /** 全基準チェック済みか */
  const allChecked = checkedItems.size === criteriaList.length;

  /** チェックボックスの切替 */
  const toggleCheck = (index: number) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  /** ゲート通過確認を実行 */
  const handleVerify = async () => {
    if (!allChecked || verifying) return;

    setVerifying(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/rehab/programs/${programId}/gate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: currentPhase, verified: true }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? 'ゲート通過確認に失敗しました');
        return;
      }

      setSuccess(true);

      // RTP 完了の場合の特別メッセージ
      if (json.data?.rtpCompleted) {
        setError(null);
      }

      // データ再取得
      setTimeout(() => {
        onGateVerified();
      }, 1000);
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-sm font-medium text-foreground">
          フェーズ {currentPhase} ゲート基準
        </h2>
        {isAlreadyMet && gate.staff && (
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
            通過済み（確認者: {gate.staff.name}）
          </p>
        )}
      </div>

      <div className="px-6 py-4">
        {/* 基準チェックリスト */}
        <ul className="space-y-3">
          {criteriaList.map((criterion, index) => (
            <li key={index} className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => !isAlreadyMet && toggleCheck(index)}
                disabled={isAlreadyMet}
                className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                  isAlreadyMet || checkedItems.has(index)
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-gray-300 bg-white hover:border-emerald-400 dark:border-gray-600 dark:bg-gray-800'
                }`}
              >
                {(isAlreadyMet || checkedItems.has(index)) && (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                )}
              </button>
              <span
                className={`text-sm ${
                  isAlreadyMet || checkedItems.has(index)
                    ? 'text-muted-foreground line-through'
                    : 'text-foreground'
                }`}
              >
                {criterion}
              </span>
            </li>
          ))}
        </ul>

        {/* エラー表示 */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* 成功表示 */}
        {success && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
            ゲート通過を確認しました
          </div>
        )}

        {/* 確認ボタン（Leader/master のみ表示） */}
        {!isAlreadyMet && (
          <div className="mt-6">
            <button
              type="button"
              onClick={handleVerify}
              disabled={!allChecked || verifying}
              className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                allChecked && !verifying
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'cursor-not-allowed bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              {verifying ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  確認中...
                </span>
              ) : (
                'ゲート通過確認'
              )}
            </button>
            {!allChecked && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                すべての基準をチェックしてからゲート通過を確認してください
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
