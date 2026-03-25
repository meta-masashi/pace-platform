'use client';

import { useState, useRef, useCallback } from 'react';

interface MessageInputProps {
  channelId: string;
  onMessageSent: () => void;
  disabled?: boolean;
}

export function MessageInput({ channelId, onMessageSent, disabled }: MessageInputProps) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  }, []);

  async function handleSend() {
    if (!content.trim() || sending || disabled) return;
    setSending(true);

    try {
      const res = await fetch('/api/community/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, content: content.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setContent('');
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
        onMessageSent();
      }
    } catch (err) {
      console.error('メッセージ送信エラー:', err);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter で送信、Shift+Enter で改行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-border bg-card p-4">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力... (Enter で送信、Shift+Enter で改行)"
          disabled={disabled || sending}
          rows={1}
          className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!content.trim() || sending || disabled}
          className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {sending ? '...' : '送信'}
        </button>
      </div>
    </div>
  );
}
