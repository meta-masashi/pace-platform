'use client';

/**
 * リルートアラートコンポーネント
 *
 * pending 状態のリルート提案がある場合に黄色のカードを表示し、
 * NLG テキストによる説明と承認/却下ボタンを提供する。
 */

import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface Adjustment {
  type: string;
  description: string;
  parameter?: string;
  oldValue?: number;
  newValue?: number;
  daysImpact: number;
}

interface ProposalData {
  id: string;
  program_id: string;
  athlete_id: string;
  detection: {
    reason: string;
    severity: string;
    detectedAt: string;
  };
  adjustments: Adjustment[];
  new_estimated_rts: string | null;
  nlg_text: string;
  status: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * リルートアラート
 *
 * pending のリルート提案を表示し、承認/却下アクションを提供する。
 */
export function RerouteAlert({
  programId,
  onAction,
}: {
  programId: string;
  onAction?: () => void;
}) {
  const [proposals, setProposals] = useState<ProposalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reroute/proposals?programId=${programId}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setProposals(json.data ?? []);
      }
    } catch {
      // サイレントフェイル（アラートは任意表示）
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  /** 承認/却下アクション */
  const handleAction = async (proposalId: string, action: 'approve' | 'reject') => {
    setActionLoading(proposalId);
    try {
      const res = await fetch('/api/reroute/proposals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, action }),
      });
      if (res.ok) {
        setProposals((prev) => prev.filter((p) => p.id !== proposalId));
        onAction?.();
      }
    } catch {
      // エラーハンドリング
    } finally {
      setActionLoading(null);
    }
  };

  if (loading || proposals.length === 0) return null;

  return (
    <div className="space-y-3">
      {proposals.map((proposal) => {
        const isExpanded = expandedId === proposal.id;
        const oldRts = proposal.detection.detectedAt
          ? new Date(proposal.detection.detectedAt)
          : null;
        const newRts = proposal.new_estimated_rts
          ? new Date(proposal.new_estimated_rts)
          : null;

        return (
          <div
            key={proposal.id}
            className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20"
          >
            {/* ヘッダー */}
            <div className="flex items-start gap-3">
              <svg
                className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  復帰スケジュール再調整の提案
                </h3>
                <p className="mt-1 whitespace-pre-line text-sm text-amber-700 dark:text-amber-400">
                  {proposal.nlg_text}
                </p>

                {/* 前後比較 */}
                {newRts && (
                  <div className="mt-3 flex items-center gap-4 text-xs">
                    {oldRts && (
                      <span className="text-muted-foreground line-through">
                        旧予定: {formatDateJP(oldRts)}
                      </span>
                    )}
                    <span className="font-medium text-amber-800 dark:text-amber-300">
                      新予定: {formatDateJP(newRts)}
                    </span>
                  </div>
                )}

                {/* 調整詳細（展開式） */}
                <button
                  type="button"
                  className="mt-2 text-xs text-amber-600 underline hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                  onClick={() => setExpandedId(isExpanded ? null : proposal.id)}
                >
                  {isExpanded ? '詳細を閉じる' : '調整詳細を表示'}
                </button>

                {isExpanded && (
                  <div className="mt-2 space-y-1 rounded-lg bg-amber-100/50 p-3 dark:bg-amber-900/30">
                    {proposal.adjustments.map((adj, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                        <span>{adj.description}</span>
                        {adj.daysImpact !== 0 && (
                          <span className={`ml-auto font-medium ${adj.daysImpact > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {adj.daysImpact > 0 ? '+' : ''}{adj.daysImpact}日
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* アクションボタン */}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={actionLoading === proposal.id}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                    onClick={() => handleAction(proposal.id, 'approve')}
                  >
                    {actionLoading === proposal.id ? (
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    )}
                    承認
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading === proposal.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    onClick={() => handleAction(proposal.id, 'reject')}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                    却下
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/** 日本語の日付表示にフォーマットする */
function formatDateJP(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
