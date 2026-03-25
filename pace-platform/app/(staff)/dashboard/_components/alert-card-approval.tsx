'use client';

/**
 * PACE Platform — 7 AM Monopoly アラートカード承認コンポーネント
 *
 * 個別アスリートのリスクアラートカード。
 * NLG エビデンステキスト・修正メニューの表示、承認・修正・却下アクションを提供する。
 *
 * Props:
 *   alertCard — API レスポンスの AlertCard オブジェクト
 *   onActionComplete — アクション完了時のコールバック
 */

import { useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// 型定義（NLG types から抽出 — クライアントコンポーネント用）
// ---------------------------------------------------------------------------

interface ModificationEntry {
  nodeId: string;
  nodeName: string;
  tag: string;
  action: 'blocked' | 'inserted';
  exerciseName: string;
  evidenceText: string;
}

interface ExerciseItem {
  id: string;
  name_ja: string;
  name_en: string;
  category: string;
  sets: number;
  reps: number;
  rpe: number;
}

interface MenuDraft {
  athleteId: string;
  date: string;
  exercises: ExerciseItem[];
  isModified: boolean;
  modifications: ModificationEntry[];
}

interface AlertCardAction {
  type: 'approve' | 'modify' | 'reject';
  label: string;
  color: 'green' | 'amber' | 'red';
}

export interface AlertCardData {
  athleteId: string;
  athleteName: string;
  riskLevel: 'critical' | 'watchlist' | 'normal';
  nlgText: string;
  modifiedMenu: MenuDraft;
  actions: AlertCardAction[];
  posteriorProbability: number;
  riskMultiplier: number;
  evidenceTrail: ModificationEntry[];
}

interface AlertCardApprovalProps {
  alertCard: AlertCardData;
  onActionComplete?: (athleteId: string, action: string, logId: string) => void;
}

// ---------------------------------------------------------------------------
// リスクレベルの視覚設定
// ---------------------------------------------------------------------------

const RISK_LEVEL_CONFIG = {
  critical: {
    badge: 'bg-red-100 text-red-800 border-red-200',
    border: 'border-red-300',
    label: 'Critical',
    dot: 'bg-red-500',
  },
  watchlist: {
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    border: 'border-amber-300',
    label: 'Watchlist',
    dot: 'bg-amber-500',
  },
  normal: {
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    border: 'border-blue-300',
    label: 'Normal',
    dot: 'bg-blue-500',
  },
} as const;

const ACTION_BUTTON_CONFIG = {
  approve: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500',
  modify: 'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-400',
  reject: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
} as const;

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function AlertCardApproval({
  alertCard,
  onActionComplete,
}: AlertCardApprovalProps) {
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completedAction, setCompletedAction] = useState<string | null>(null);
  const [completedLogId, setCompletedLogId] = useState<string | null>(null);

  const config = RISK_LEVEL_CONFIG[alertCard.riskLevel];

  /** 承認アクションを実行する */
  const handleAction = useCallback(
    async (actionType: 'approve' | 'modify' | 'reject') => {
      if (actionType === 'modify' && !editMode) {
        setEditMode(true);
        setExpanded(true);
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch('/api/approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            athleteId: alertCard.athleteId,
            action: actionType === 'modify' ? 'edit_approve' : actionType,
            menuJson: alertCard.modifiedMenu,
            evidenceText: alertCard.nlgText,
            nlgText: alertCard.nlgText,
            riskScore: alertCard.riskMultiplier,
            diagnosisContext: {
              posteriorProbability: alertCard.posteriorProbability,
              evidenceTrail: alertCard.evidenceTrail,
            },
          }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          console.error('承認API エラー:', errBody);
          return;
        }

        const json = await res.json();
        if (json.success) {
          setCompletedAction(actionType);
          setCompletedLogId(json.data.auditId);
          onActionComplete?.(alertCard.athleteId, actionType, json.data.auditId);
        }
      } catch (err) {
        console.error('承認処理エラー:', err);
      } finally {
        setSubmitting(false);
        setEditMode(false);
      }
    },
    [alertCard, editMode, onActionComplete]
  );

  // 完了済み表示
  if (completedAction) {
    return (
      <div className={`rounded-lg border ${config.border} bg-card p-4`}>
        <div className="flex items-center gap-3">
          <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
          <div>
            <p className="text-sm font-medium">
              {alertCard.athleteName} —{' '}
              {completedAction === 'approve'
                ? '承認しました'
                : completedAction === 'modify'
                  ? '修正して承認しました'
                  : '却下しました'}
            </p>
            {completedLogId && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                監査ログ ID: {completedLogId}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${config.border} bg-card`}>
      {/* ヘッダー: アスリート名 + リスクバッジ */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />
          <span className="text-sm font-semibold">{alertCard.athleteName}</span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${config.badge}`}
          >
            {config.label}
          </span>
          <span className="text-xs text-muted-foreground">
            リスク倍率: {alertCard.riskMultiplier.toFixed(1)}x
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          {expanded ? '閉じる' : '詳細を表示'}
        </button>
      </div>

      {/* NLG エビデンステキスト */}
      <div className="px-5 py-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {alertCard.nlgText}
        </p>
      </div>

      {/* 展開可能セクション: メニュー修正詳細 */}
      {expanded && (
        <div className="border-t border-border px-5 py-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            メニュー修正詳細
          </h4>

          {alertCard.evidenceTrail.length === 0 ? (
            <p className="text-xs text-muted-foreground">修正はありません</p>
          ) : (
            <ul className="space-y-1.5">
              {alertCard.evidenceTrail.map((mod, i) => (
                <li key={`${mod.nodeId}-${mod.tag}-${i}`} className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 inline-block h-4 w-4 shrink-0 rounded text-center text-xs font-bold leading-4 ${
                      mod.action === 'blocked'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {mod.action === 'blocked' ? '−' : '+'}
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs font-medium">{mod.exerciseName}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({mod.tag})
                    </span>
                    {mod.evidenceText && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {mod.evidenceText}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* 修正後メニュープレビュー */}
          {alertCard.modifiedMenu.exercises.length > 0 && (
            <div className="mt-3">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                修正後メニュー
              </h4>
              <div className="rounded border border-border bg-muted/30 p-2">
                <ul className="space-y-1">
                  {alertCard.modifiedMenu.exercises.map((ex) => (
                    <li key={ex.id} className="text-xs">
                      <span className="font-medium">{ex.name_ja}</span>
                      <span className="ml-2 text-muted-foreground">
                        {ex.sets}×{ex.reps} RPE{ex.rpe}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* アクションボタン */}
      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        {alertCard.actions.map((action) => (
          <button
            key={action.type}
            type="button"
            disabled={submitting}
            onClick={() => handleAction(action.type)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 ${ACTION_BUTTON_CONFIG[action.type]}`}
          >
            {submitting ? '処理中...' : action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// インラインアイコン
// ---------------------------------------------------------------------------

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
