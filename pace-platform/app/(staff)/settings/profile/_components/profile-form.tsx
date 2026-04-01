'use client';

import { useState } from 'react';

interface ProfileFormProps {
  initialName: string;
}

export function ProfileForm({ initialName }: ProfileFormProps) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'プロフィールの更新に失敗しました');
        return;
      }

      setName(data.name);
      setSuccess('プロフィールを更新しました');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) { void err; // silently handled
      setError('プロフィールの更新中にエラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {success && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="profile-name"
          className="block text-sm font-medium text-foreground"
        >
          表示名
        </label>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="名前を入力"
        />
      </div>

      <button
        type="submit"
        disabled={saving || name.trim() === initialName}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? '保存中...' : '保存'}
      </button>
    </form>
  );
}
