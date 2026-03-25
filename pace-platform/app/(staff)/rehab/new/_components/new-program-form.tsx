'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface Athlete {
  id: string;
  name: string;
  position: string | null;
  number: number | null;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * 新規リハビリプログラム作成フォーム
 *
 * - アスリート選択（ドロップダウン）
 * - 診断コード入力
 * - 予定 RTP 日（日付ピッカー）
 */
export function NewProgramForm() {
  const router = useRouter();

  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loadingAthletes, setLoadingAthletes] = useState(true);

  const [athleteId, setAthleteId] = useState('');
  const [diagnosisCode, setDiagnosisCode] = useState('');
  const [estimatedRtpDate, setEstimatedRtpDate] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** アスリート一覧を取得 */
  useEffect(() => {
    async function fetchAthletes() {
      try {
        const res = await fetch('/api/team/dashboard?team_id=all');
        if (res.ok) {
          const json = await res.json();
          // ダッシュボードAPIから取得できるアスリートデータを利用
          const list = (json.data?.athletes ?? json.data?.alerts ?? [])
            .map((a: Record<string, unknown>) => ({
              id: (a.athleteId ?? a.id) as string,
              name: (a.athleteName ?? a.name) as string,
              position: (a.position ?? null) as string | null,
              number: (a.number ?? null) as number | null,
            }))
            .filter((a: Athlete) => a.id && a.name);

          // 重複除去
          const unique = Array.from(
            new Map(list.map((a: Athlete) => [a.id, a])).values()
          ) as Athlete[];
          setAthletes(unique);
        }
      } catch {
        // アスリート取得失敗は無視（手動入力で対応可能）
      } finally {
        setLoadingAthletes(false);
      }
    }

    fetchAthletes();
  }, []);

  /** フォーム送信 */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!athleteId) {
      setError('アスリートを選択してください');
      return;
    }
    if (!diagnosisCode) {
      setError('診断コードを入力してください');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/rehab/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId,
          diagnosisCode,
          estimatedRtpDate: estimatedRtpDate || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? 'プログラムの作成に失敗しました');
        return;
      }

      // 作成成功 → 詳細ページへ遷移
      router.push(`/rehab/${json.data.programId}`);
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 戻るリンク */}
      <Link
        href="/rehab"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        リハビリ一覧に戻る
      </Link>

      <div className="rounded-lg border border-border bg-card">
        <div className="space-y-5 p-6">
          {/* アスリート選択 */}
          <div>
            <label htmlFor="athleteId" className="block text-sm font-medium text-foreground">
              アスリート <span className="text-red-500">*</span>
            </label>
            <select
              id="athleteId"
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              disabled={loadingAthletes}
              className="mt-1.5 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">
                {loadingAthletes ? '読み込み中...' : '選択してください'}
              </option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.number != null ? ` #${a.number}` : ''}
                  {a.position ? ` (${a.position})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 診断コード */}
          <div>
            <label htmlFor="diagnosisCode" className="block text-sm font-medium text-foreground">
              診断コード <span className="text-red-500">*</span>
            </label>
            <input
              id="diagnosisCode"
              type="text"
              value={diagnosisCode}
              onChange={(e) => setDiagnosisCode(e.target.value)}
              placeholder="例: ACL_tear, ankle_sprain"
              className="mt-1.5 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              アセスメント結果の傷害タイプまたは手動入力
            </p>
          </div>

          {/* 予定 RTP 日 */}
          <div>
            <label htmlFor="estimatedRtpDate" className="block text-sm font-medium text-foreground">
              予定復帰日（任意）
            </label>
            <input
              id="estimatedRtpDate"
              type="date"
              value={estimatedRtpDate}
              onChange={(e) => setEstimatedRtpDate(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* エラー */}
        {error && (
          <div className="mx-6 mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* 送信ボタン */}
        <div className="border-t border-border px-6 py-4">
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-700"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                作成中...
              </span>
            ) : (
              'プログラムを作成'
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
