'use client';

import { useEffect, useRef } from 'react';

interface StaffInfo {
  id: string;
  name: string;
  role: string;
}

interface Message {
  id: string;
  content: string;
  attachments_json: unknown[];
  created_at: string;
  staff_id: string;
  staff: StaffInfo | null;
}

interface MessageAreaProps {
  messages: Message[];
  channelName: string;
  loading: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  master: 'text-purple-600',
  AT: 'text-blue-600',
  PT: 'text-green-600',
  'S&C': 'text-orange-600',
};

export function MessageArea({ messages, channelName, loading }: MessageAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 新しいメッセージが追加されたらスクロール
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">メッセージを読み込み中...</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4">
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
          <span className="mb-2 text-3xl">#</span>
          <p className="text-lg font-medium">{channelName}</p>
          <p className="text-sm">このチャンネルにはまだメッセージがありません</p>
          <p className="text-sm">最初のメッセージを送信しましょう</p>
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((msg) => {
            const staffName = msg.staff?.name ?? '不明なスタッフ';
            const staffRole = msg.staff?.role ?? '';
            const initials = staffName.slice(0, 1).toUpperCase();
            const timestamp = new Date(msg.created_at);
            const timeStr = timestamp.toLocaleString('ja-JP', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div key={msg.id} className="group flex gap-3">
                {/* アバタープレースホルダー */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                  {initials}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">{staffName}</span>
                    {staffRole && (
                      <span
                        className={`text-[10px] font-medium ${
                          ROLE_COLORS[staffRole] ?? 'text-muted-foreground'
                        }`}
                      >
                        {staffRole}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      {timeStr}
                    </span>
                  </div>

                  {/* メッセージ本文 */}
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">
                    {msg.content}
                  </p>

                  {/* 添付ファイル */}
                  {Array.isArray(msg.attachments_json) &&
                    msg.attachments_json.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {msg.attachments_json.map((att, i) => (
                          <div
                            key={i}
                            className="rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground"
                          >
                            {typeof att === 'object' && att !== null && 'name' in att
                              ? String((att as { name: string }).name)
                              : `添付ファイル ${i + 1}`}
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
