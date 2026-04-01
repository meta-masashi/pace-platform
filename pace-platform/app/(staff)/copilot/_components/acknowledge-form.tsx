'use client';

/**
 * PACE v6.0 — P1/P2 アラート承認フォーム
 *
 * スタッフが P1/P2 判定に対して以下のアクションを行う:
 * - 承認: そのまま推奨を承認
 * - 修正して承認: 推奨を修正した上で承認
 * - 却下: 推奨を却下（理由必須）
 * - オーバーライド: システム判定を上書き（理由必須）
 *
 * デジタル署名としてスタッフ名 + タイムスタンプを記録する。
 */

import { useState } from 'react';

type AcknowledgeAction = 'approved' | 'modified' | 'rejected' | 'override';

interface AcknowledgeFormProps {
  traceId: string;
  onSuccess: (action: AcknowledgeAction) => void;
  onCancel: () => void;
}

const ACTION_LABELS: Record<AcknowledgeAction, string> = {
  approved: '承認',
  modified: '修正して承認',
  rejected: '却下',
  override: 'オーバーライド',
};

export function AcknowledgeForm({ traceId, onSuccess, onCancel }: AcknowledgeFormProps) {
  const [action, setAction] = useState<AcknowledgeAction>('approved');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiresNotes = action === 'modified' || action === 'rejected' || action === 'override';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (requiresNotes && !notes.trim()) {
      setError('修正・却下・オーバーライドの場合は理由の記入が必要です。');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/pipeline/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traceId,
          action,
          notes: notes.trim() || undefined,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        setError(result.error ?? '承認処理に失敗しました。');
        return;
      }

      onSuccess(action);
    } catch (err) { void err; // silently handled
      setError('ネットワークエラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">アクションを選択</p>
        <div className="space-y-2">
          {(Object.entries(ACTION_LABELS) as [AcknowledgeAction, string][]).map(
            ([value, label]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                  action === value
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                <input
                  type="radio"
                  name="action"
                  value={value}
                  checked={action === value}
                  onChange={() => setAction(value)}
                  className="h-4 w-4 accent-primary"
                />
                {label}
              </label>
            ),
          )}
        </div>
      </div>

      <div>
        <label htmlFor="acknowledge-notes" className="mb-1 block text-sm font-semibold text-foreground">
          備考・理由{requiresNotes && <span className="ml-1 text-red-500">*</span>}
        </label>
        <textarea
          id="acknowledge-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            requiresNotes
              ? '理由を記入してください（必須）'
              : '備考があれば記入してください（任意）'
          }
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* デジタル署名表示 */}
      <div className="rounded-md bg-muted/50 p-3">
        <p className="text-xs text-muted-foreground">
          デジタル署名: ログイン中のスタッフ名で記録されます
        </p>
        <p className="text-xs text-muted-foreground">
          記録日時: {new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={isSubmitting || (requiresNotes && !notes.trim())}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? '処理中...' : '確認して送信'}
        </button>
      </div>
    </form>
  );
}
