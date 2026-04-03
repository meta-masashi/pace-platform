'use client';

/**
 * RehabChat — チャットベース個別リハビリメニュー生成 UI（Pro+ 専用）
 *
 * 左: チャットエリア / 右: リハビリメニュープレビュー
 */

import { useState, useRef, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RehabExercisePreview {
  id: string;
  name: string;
  sets: number;
  reps: string;
  pain_vas_limit: number;
}

interface RehabPhasePreview {
  phase: string;
  phase_label: string;
  duration_days_min: number;
  duration_days_max: number;
  goals: string[];
  exercises: RehabExercisePreview[];
  progression_criteria: string[];
  red_flags: string[];
}

interface RehabMenuPreview {
  contraindication_tags?: string[];
  primary_diagnosis_hint?: string;
  risk_level?: string;
  phases?: RehabPhasePreview[];
  general_precautions?: string[];
  follow_up_recommendation?: string;
}

interface RehabChatProps {
  athleteId: string;
  athleteName: string;
  onMenuFinalized: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  acute: '急性期',
  recovery: '回復期',
  functional: '機能回復期',
  return_to_sport: '競技復帰期',
};

const RISK_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
};

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function RehabChat({
  athleteId,
  athleteName,
  onMenuFinalized,
}: RehabChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [menuPreview, setMenuPreview] = useState<RehabMenuPreview | null>(null);
  const [contraindicationTags, setContraindicationTags] = useState<string[]>([]);
  const [tokenUsage, setTokenUsage] = useState<{ usage: number; limit: number } | null>(null);
  const [budgetError, setBudgetError] = useState<{
    message: string;
    ctaOptions: Array<{ label: string; href: string }>;
  } | null>(null);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 初回メッセージ自動送信
  useEffect(() => {
    if (messages.length === 0 && athleteId) {
      sendMessage(`${athleteName}選手のリハビリメニューを作成したいです。現在の状態を教えてください。`);
    }
    // eslint-disable-next-line -- initial send only
  }, [athleteId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setBudgetError(null);

    try {
      const res = await fetch('/api/rehab/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId,
          sessionId,
          message: text,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'TOKEN_BUDGET_EXCEEDED') {
          setBudgetError({
            message: data.message,
            ctaOptions: data.ctaOptions ?? [],
          });
          return;
        }
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `エラー: ${data.error ?? '不明なエラー'}` },
        ]);
        return;
      }

      if (data.data?.sessionId) {
        setSessionId(data.data.sessionId);
      }
      if (data.data?.tokenUsage !== undefined) {
        setTokenUsage({ usage: data.data.tokenUsage, limit: data.data.tokenLimit });
      }
      if (data.data?.menu) {
        setMenuPreview(data.data.menu);
      }
      if (data.data?.contraindicationTags) {
        setContraindicationTags(data.data.contraindicationTags);
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.data?.reply ?? '応答がありません。' },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'エラー: 通信に失敗しました。' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [athleteId, sessionId, loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex gap-4" style={{ minHeight: '600px' }}>
      {/* 左: チャットエリア */}
      <div className="flex flex-1 flex-col rounded-lg border border-border bg-card">
        {/* メッセージ一覧 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                <p className="whitespace-pre-wrap">{stripJsonBlock(msg.content)}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                <span className="animate-pulse">AI が考えています...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* トークン予算超過 CTA */}
        {budgetError && (
          <div className="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-800">{budgetError.message}</p>
            <div className="mt-2 flex gap-2">
              {budgetError.ctaOptions.map((cta) => (
                <a
                  key={cta.href}
                  href={cta.href}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {cta.label}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* 入力欄 */}
        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="リハビリメニューの指示を入力..."
              rows={2}
              disabled={loading || !!budgetError}
              className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim() || !!budgetError}
              className="self-end rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              送信
            </button>
          </div>
          {tokenUsage && tokenUsage.limit < Infinity && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>トークン: {tokenUsage.usage.toLocaleString()} / {tokenUsage.limit.toLocaleString()}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (tokenUsage.usage / tokenUsage.limit) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 右: リハビリメニュープレビュー */}
      <div className="w-[400px] shrink-0 overflow-y-auto rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold">リハビリメニュー</h3>
          {menuPreview && (
            <button
              type="button"
              onClick={() => setShowFinalizeDialog(true)}
              disabled={finalizing}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              メニュー確定
            </button>
          )}
        </div>

        {/* 禁忌タグバッジ */}
        {contraindicationTags.length > 0 && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50/50 p-2">
            <p className="mb-1 text-[10px] font-bold text-red-700">禁忌タグ</p>
            <div className="flex flex-wrap gap-1">
              {contraindicationTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 確定ダイアログ */}
        {showFinalizeDialog && menuPreview && (
          <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-medium text-emerald-800">
              以下の禁忌タグとメニューを承認しますか？
            </p>
            {contraindicationTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {contraindicationTags.map((tag) => (
                  <span key={tag} className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-1 text-[10px] text-emerald-600">
              承認後はメニューと禁忌タグが確定されます（AT/PT/master権限が必要）
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={finalizing}
                onClick={async () => {
                  setFinalizing(true);
                  try {
                    const res = await fetch('/api/rehab/chat', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        athleteId,
                        sessionId,
                        message: '承認確定',
                        finalize: true,
                      }),
                    });
                    const data = await res.json();
                    if (res.ok && data.data?.finalized) {
                      setShowFinalizeDialog(false);
                      onMenuFinalized();
                    } else {
                      setMessages((prev) => [
                        ...prev,
                        { role: 'assistant', content: `承認エラー: ${data.error ?? '不明なエラー'}` },
                      ]);
                      setShowFinalizeDialog(false);
                    }
                  } catch {
                    setMessages((prev) => [
                      ...prev,
                      { role: 'assistant', content: '承認エラー: 通信に失敗しました。' },
                    ]);
                    setShowFinalizeDialog(false);
                  } finally {
                    setFinalizing(false);
                  }
                }}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {finalizing ? '承認中...' : '承認する'}
              </button>
              <button
                type="button"
                onClick={() => setShowFinalizeDialog(false)}
                disabled={finalizing}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {!menuPreview ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            AI にリハビリメニューを提案してもらうと、ここにプレビューが表示されます
          </div>
        ) : (
          <div className="space-y-3">
            {/* 診断ヒント + リスクレベル */}
            {menuPreview.primary_diagnosis_hint && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{menuPreview.primary_diagnosis_hint}</span>
                {menuPreview.risk_level && (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${RISK_STYLES[menuPreview.risk_level] ?? 'bg-muted'}`}>
                    {menuPreview.risk_level}
                  </span>
                )}
              </div>
            )}

            {/* フェーズ */}
            {menuPreview.phases?.map((phase) => (
              <div key={phase.phase} className="rounded-md border border-border p-2">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-bold">
                    {PHASE_LABELS[phase.phase] ?? phase.phase_label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {phase.duration_days_min}-{phase.duration_days_max}日
                  </span>
                </div>
                {phase.goals.length > 0 && (
                  <p className="mb-1 text-[10px] text-muted-foreground">
                    目標: {phase.goals.join(', ')}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {phase.exercises?.map((ex) => (
                    <li key={ex.id} className="text-[11px] text-foreground">
                      {ex.name} — {ex.sets}×{ex.reps}
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        (VAS≤{ex.pain_vas_limit})
                      </span>
                    </li>
                  ))}
                </ul>
                {phase.red_flags.length > 0 && (
                  <div className="mt-1">
                    <span className="text-[10px] font-medium text-red-600">中止基準:</span>
                    {phase.red_flags.map((flag, i) => (
                      <span key={i} className="ml-1 text-[10px] text-red-600">{flag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* 注意事項 */}
            {menuPreview.general_precautions && menuPreview.general_precautions.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50/50 p-2">
                <p className="mb-1 text-[10px] font-bold text-amber-700">注意事項</p>
                {menuPreview.general_precautions.map((note, i) => (
                  <p key={i} className="text-[11px] text-amber-700">{note}</p>
                ))}
              </div>
            )}

            {/* フォローアップ */}
            {menuPreview.follow_up_recommendation && (
              <p className="text-[10px] text-muted-foreground">
                {menuPreview.follow_up_recommendation}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** AI 返答から JSON ブロックを除去して表示用テキストを返す */
function stripJsonBlock(text: string): string {
  return text.replace(/```json[\s\S]*?```/g, '').trim();
}
