'use client';

/**
 * TrainingChat — チャットベース AI トレーニングメニュー生成 UI
 *
 * 左: チャットエリア / 右: メニュープレビュー
 */

import { useState, useRef, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface TrainingSession {
  day: string;
  session_type: string;
  intensity: string;
  duration_minutes: number;
  exercises: Array<{ name: string; sets: number; reps: string; load_note: string }>;
  coaching_notes: string;
}

interface MenuPreview {
  team_sessions?: TrainingSession[];
  individual_adjustments?: Array<{
    athlete_name: string;
    reason: string;
    modifications: string[];
  }>;
  weekly_load_note?: string;
}

interface TrainingChatProps {
  teamId: string;
  teamName: string;
  weekStartDate: string;
  trainingPeriod: 'pre_season' | 'in_season' | 'post_season' | 'off_season';
  onMenuFinalized: () => void;
}

const PERIOD_LABELS: Record<string, string> = {
  pre_season: 'プレシーズン',
  in_season: 'インシーズン',
  post_season: 'ポストシーズン',
  off_season: 'オフシーズン',
};

const DAY_LABELS: Record<string, string> = {
  Monday: '月', Tuesday: '火', Wednesday: '水', Thursday: '木',
  Friday: '金', Saturday: '土', Sunday: '日',
};

const INTENSITY_STYLES: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  moderate: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function TrainingChat({
  teamId,
  teamName,
  weekStartDate,
  trainingPeriod,
  onMenuFinalized,
}: TrainingChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [menuPreview, setMenuPreview] = useState<MenuPreview | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{ usage: number; limit: number } | null>(null);
  const [budgetError, setBudgetError] = useState<{
    message: string;
    ctaOptions: Array<{ label: string; href: string }>;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 初回メッセージ自動送信
  useEffect(() => {
    if (messages.length === 0 && teamId) {
      sendMessage(`${teamName}の${PERIOD_LABELS[trainingPeriod] ?? trainingPeriod}期の${weekStartDate}週のトレーニングメニューを作成してください。チーム状況を教えてください。`);
    }
    // eslint-disable-next-line -- initial send only
  }, [teamId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setBudgetError(null);

    try {
      const res = await fetch('/api/training/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId,
          weekStartDate,
          trainingPeriod,
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
  }, [teamId, weekStartDate, trainingPeriod, sessionId, loading]);

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
              placeholder="メニューの指示を入力..."
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

      {/* 右: メニュープレビュー */}
      <div className="w-[400px] shrink-0 overflow-y-auto rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold">メニュープレビュー</h3>
          {menuPreview && (
            <button
              type="button"
              onClick={onMenuFinalized}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              メニュー確定
            </button>
          )}
        </div>

        {!menuPreview ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            AI にメニューを提案してもらうと、ここにプレビューが表示されます
          </div>
        ) : (
          <div className="space-y-3">
            {menuPreview.team_sessions?.map((session) => (
              <div key={session.day} className="rounded-md border border-border p-2">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-bold">{DAY_LABELS[session.day] ?? session.day}</span>
                  <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${INTENSITY_STYLES[session.intensity] ?? 'bg-muted'}`}>
                    {session.intensity}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{session.duration_minutes}分</span>
                </div>
                <ul className="space-y-0.5">
                  {session.exercises?.map((ex, i) => (
                    <li key={i} className="text-[11px] text-foreground">
                      {ex.name} — {ex.sets}×{ex.reps}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {menuPreview.individual_adjustments && menuPreview.individual_adjustments.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50/50 p-2">
                <p className="mb-1 text-[10px] font-bold text-amber-700">個別調整</p>
                {menuPreview.individual_adjustments.map((adj, i) => (
                  <p key={i} className="text-[11px] text-amber-700">
                    {adj.athlete_name}: {adj.reason}
                  </p>
                ))}
              </div>
            )}

            {menuPreview.weekly_load_note && (
              <p className="text-[10px] text-muted-foreground">
                {menuPreview.weekly_load_note}
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
