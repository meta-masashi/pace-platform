'use client';

import { useState } from 'react';

const ROLE_OPTIONS = [
  { value: 'AT', label: 'AT（アスレティックトレーナー）' },
  { value: 'PT', label: 'PT（理学療法士）' },
  { value: 'S&C', label: 'S&C（ストレングス&コンディショニング）' },
  { value: 'master', label: 'Master（管理者）' },
];

interface InviteFormProps {
  onInvited: () => void;
}

export function InviteForm({ onInvited }: InviteFormProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('AT');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const json = await res.json();

      if (!json.success) {
        setError(json.error ?? '招待に失敗しました。');
        return;
      }

      setSuccess(
        json.invited
          ? `${email} に招待メールを送信しました。`
          : `${email} をスタッフとして登録しました。`
      );
      setEmail('');
      setRole('AT');
      onInvited();
    } catch (err) { void err; // silently handled
      setError('通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        スタッフ招待
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">新規スタッフ招待</h3>
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
            setSuccess(null);
          }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          閉じる
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="invite-email" className="mb-1 block text-sm text-muted-foreground">
            メールアドレス
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@example.com"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="invite-role" className="mb-1 block text-sm text-muted-foreground">
            ロール
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {success && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? '送信中...' : '招待メールを送信'}
        </button>
      </form>
    </div>
  );
}
