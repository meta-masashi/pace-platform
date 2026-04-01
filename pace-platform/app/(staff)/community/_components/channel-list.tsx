'use client';

import { useState } from 'react';

interface Channel {
  id: string;
  name: string;
  type: string;
  team_id: string | null;
  created_at: string;
}

interface ChannelListProps {
  channels: Channel[];
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
  onChannelCreated: (channel: Channel) => void;
  canCreate: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  general: '一般',
  team: 'チーム',
  medical: 'メディカル',
  rehab: 'リハビリ',
  s_and_c: 'S&C',
};

export function ChannelList({
  channels,
  activeChannelId,
  onSelectChannel,
  onChannelCreated,
  canCreate,
}: ChannelListProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('general');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/community/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), type: newType }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        onChannelCreated(json.data);
        setNewName('');
        setCreating(false);
      } else {
        setError(json.error ?? 'チャンネルの作成に失敗しました。');
      }
    } catch (err) { void err; // silently handled
      setError('通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">チャンネル</h2>
        {canCreate && (
          <button
            onClick={() => setCreating(!creating)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="新しいチャンネル"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>

      {creating && (
        <div className="border-b border-border p-3">
          <form onSubmit={handleCreate} className="space-y-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="チャンネル名"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              autoFocus
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            >
              <option value="general">一般</option>
              <option value="team">チーム</option>
              <option value="medical">メディカル</option>
              <option value="rehab">リハビリ</option>
              <option value="s_and_c">S&C</option>
            </select>
            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || !newName.trim()}
                className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {submitting ? '作成中...' : '作成'}
              </button>
              <button
                type="button"
                onClick={() => { setCreating(false); setError(null); }}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                キャンセル
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {channels.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            チャンネルがありません
          </p>
        ) : (
          <div className="space-y-0.5">
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => onSelectChannel(ch.id)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  activeChannelId === ch.id
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <span className="text-base leading-none">#</span>
                <span className="flex-1 truncate">{ch.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {TYPE_LABELS[ch.type] ?? ch.type}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
