'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface AthleteEntry {
  name: string;
  position: string;
  number: string;
}

interface InviteEntry {
  email: string;
  role: 'AT' | 'PT' | 'S&C';
}

const SPORT_OPTIONS = [
  { value: 'soccer', label: 'サッカー' },
  { value: 'baseball', label: '野球' },
  { value: 'basketball', label: 'バスケ' },
  { value: 'rugby', label: 'ラグビー' },
  { value: 'other', label: 'その他' },
] as const;

const ROLE_OPTIONS = [
  { value: 'AT' as const, label: 'AT（アスレティックトレーナー）' },
  { value: 'PT' as const, label: 'PT（理学療法士）' },
  { value: 'S&C' as const, label: 'S&C（ストレングスコーチ）' },
];

const STEPS = [
  { number: 1, label: '組織情報' },
  { number: 2, label: 'チーム作成' },
  { number: 3, label: '選手登録' },
  { number: 4, label: 'スタッフ招待' },
] as const;

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function SetupWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [orgName, setOrgName] = useState('');
  const [sport, setSport] = useState('');

  // Step 2
  const [teamName, setTeamName] = useState('');

  // Step 3
  const [athletes, setAthletes] = useState<AthleteEntry[]>([]);
  const [newAthlete, setNewAthlete] = useState<AthleteEntry>({
    name: '',
    position: '',
    number: '',
  });

  // Step 4
  const [invites, setInvites] = useState<InviteEntry[]>([]);
  const [newInvite, setNewInvite] = useState<InviteEntry>({
    email: '',
    role: 'AT',
  });

  // CSV
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvUploading, setCsvUploading] = useState(false);

  // ---------------------------------------------------------------------------
  // ナビゲーション
  // ---------------------------------------------------------------------------

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 1:
        return orgName.trim().length > 0 && sport.length > 0;
      case 2:
        return teamName.trim().length > 0;
      case 3:
        return athletes.length >= 1;
      case 4:
        return true; // スキップ可能
      default:
        return false;
    }
  }, [currentStep, orgName, sport, teamName, athletes.length]);

  const goNext = () => {
    if (canProceed()) {
      setError(null);
      setCurrentStep((s) => Math.min(s + 1, 4));
    }
  };

  const goBack = () => {
    setError(null);
    setCurrentStep((s) => Math.max(s - 1, 1));
  };

  // ---------------------------------------------------------------------------
  // Step 3: 選手追加
  // ---------------------------------------------------------------------------

  const addAthlete = () => {
    if (newAthlete.name.trim().length === 0) return;
    setAthletes((prev) => [...prev, { ...newAthlete, name: newAthlete.name.trim() }]);
    setNewAthlete({ name: '', position: '', number: '' });
  };

  const removeAthlete = (index: number) => {
    setAthletes((prev) => prev.filter((_, i) => i !== index));
  };

  // ---------------------------------------------------------------------------
  // Step 3: CSV インポート
  // ---------------------------------------------------------------------------

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/onboarding/athletes/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'CSV読み込みに失敗しました。');
        return;
      }

      if (data.errors && data.errors.length > 0) {
        setError(`${data.errors.length}件のエラーがあります: ${data.errors.join(', ')}`);
      }

      if (data.athletes && data.athletes.length > 0) {
        setAthletes((prev) => [
          ...prev,
          ...data.athletes.map((a: { name: string; position: string; number: string }) => ({
            name: a.name,
            position: a.position ?? '',
            number: a.number ?? '',
          })),
        ]);
      }
    } catch {
      setError('CSV読み込み中にエラーが発生しました。');
    } finally {
      setCsvUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Step 4: 招待追加
  // ---------------------------------------------------------------------------

  const addInvite = () => {
    if (newInvite.email.trim().length === 0) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newInvite.email.trim())) {
      setError('有効なメールアドレスを入力してください。');
      return;
    }
    setInvites((prev) => [...prev, { ...newInvite, email: newInvite.email.trim() }]);
    setNewInvite({ email: '', role: 'AT' });
    setError(null);
  };

  const removeInvite = (index: number) => {
    setInvites((prev) => prev.filter((_, i) => i !== index));
  };

  // ---------------------------------------------------------------------------
  // 完了: セットアップ送信
  // ---------------------------------------------------------------------------

  const handleComplete = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/onboarding/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: orgName.trim(),
          sport,
          teamName: teamName.trim(),
          athletes: athletes.map((a) => ({
            name: a.name,
            position: a.position || null,
            number: a.number ? parseInt(a.number, 10) : null,
          })),
          invites: invites.length > 0 ? invites : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'セットアップに失敗しました。');
        return;
      }

      // セットアップ完了 → ダッシュボードへ
      router.push('/dashboard');
    } catch {
      setError('セットアップ中にエラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------------------------

  return (
    <div>
      {/* ステップインジケーター */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, i) => (
            <div key={step.number} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                    currentStep === step.number
                      ? 'bg-primary text-primary-foreground'
                      : currentStep > step.number
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {currentStep > step.number ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={`mt-1.5 text-xs font-medium ${
                    currentStep >= step.number
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-3 mt-[-1rem] h-0.5 w-16 sm:w-24 ${
                    currentStep > step.number ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ステップコンテンツ */}
      <div className="rounded-lg border border-border bg-card p-6">
        {/* Step 1: 組織情報 */}
        {currentStep === 1 && (
          <div>
            <h2 className="mb-1 text-xl font-semibold">組織情報</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              あなたのクラブ・チームの基本情報を入力してください。
            </p>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  組織名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="例: FCパース"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  競技種目 <span className="text-red-500">*</span>
                </label>
                <select
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">選択してください</option>
                  {SPORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: チーム作成 */}
        {currentStep === 2 && (
          <div>
            <h2 className="mb-1 text-xl font-semibold">チーム作成</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              最初のチームを作成します。あとから追加できます。
            </p>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                チーム名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="例: トップチーム"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        )}

        {/* Step 3: 選手登録 */}
        {currentStep === 3 && (
          <div>
            <h2 className="mb-1 text-xl font-semibold">選手登録</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              選手を登録してください。CSVアップロードまたは手動入力が可能です。最低1名必要です。
            </p>

            {/* CSV アップロード */}
            <div className="mb-6 rounded-md border border-dashed border-border p-4">
              <p className="mb-2 text-sm font-medium">CSVファイルから一括登録</p>
              <p className="mb-3 text-xs text-muted-foreground">
                CSVフォーマット: name, position, number（ヘッダー行あり）
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                disabled={csvUploading}
                className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
              />
              {csvUploading && (
                <p className="mt-2 text-xs text-muted-foreground">読み込み中...</p>
              )}
            </div>

            {/* 手動入力 */}
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium">手動で追加</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAthlete.name}
                  onChange={(e) =>
                    setNewAthlete((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="名前"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addAthlete();
                  }}
                />
                <input
                  type="text"
                  value={newAthlete.position}
                  onChange={(e) =>
                    setNewAthlete((prev) => ({ ...prev, position: e.target.value }))
                  }
                  placeholder="ポジション"
                  className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="text"
                  value={newAthlete.number}
                  onChange={(e) =>
                    setNewAthlete((prev) => ({ ...prev, number: e.target.value }))
                  }
                  placeholder="番号"
                  className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={addAthlete}
                  disabled={newAthlete.name.trim().length === 0}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  追加
                </button>
              </div>
            </div>

            {/* 選手リスト */}
            {athletes.length > 0 && (
              <div className="rounded-md border border-border">
                <div className="grid grid-cols-[1fr_100px_60px_40px] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>名前</span>
                  <span>ポジション</span>
                  <span>番号</span>
                  <span />
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {athletes.map((athlete, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_100px_60px_40px] items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0"
                    >
                      <span className="truncate">{athlete.name}</span>
                      <span className="text-muted-foreground">
                        {athlete.position || '-'}
                      </span>
                      <span className="text-muted-foreground">
                        {athlete.number || '-'}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAthlete(i)}
                        className="text-muted-foreground hover:text-red-500"
                        title="削除"
                      >
                        <XIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
                  合計: {athletes.length}名
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: スタッフ招待 */}
        {currentStep === 4 && (
          <div>
            <h2 className="mb-1 text-xl font-semibold">スタッフ招待</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              他のスタッフメンバーを招待できます。あとから追加することも可能です。
            </p>

            {/* 招待入力 */}
            <div className="mb-4 flex gap-2">
              <input
                type="email"
                value={newInvite.email}
                onChange={(e) =>
                  setNewInvite((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="メールアドレス"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addInvite();
                }}
              />
              <select
                value={newInvite.role}
                onChange={(e) =>
                  setNewInvite((prev) => ({
                    ...prev,
                    role: e.target.value as InviteEntry['role'],
                  }))
                }
                className="w-44 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addInvite}
                disabled={newInvite.email.trim().length === 0}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                追加
              </button>
            </div>

            {/* 招待リスト */}
            {invites.length > 0 && (
              <div className="mb-6 rounded-md border border-border">
                {invites.map((invite, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border-b border-border px-3 py-2 text-sm last:border-b-0"
                  >
                    <div>
                      <span>{invite.email}</span>
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {invite.role}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeInvite(i)}
                      className="text-muted-foreground hover:text-red-500"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ナビゲーションボタン */}
      <div className="mt-6 flex items-center justify-between">
        <div>
          {currentStep > 1 && (
            <button
              type="button"
              onClick={goBack}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              戻る
            </button>
          )}
        </div>

        <div className="flex gap-3">
          {currentStep === 4 && (
            <button
              type="button"
              onClick={handleComplete}
              disabled={isSubmitting}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              あとで
            </button>
          )}

          {currentStep < 4 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canProceed()}
              className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              次へ
            </button>
          ) : (
            <button
              type="button"
              onClick={handleComplete}
              disabled={isSubmitting}
              className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? 'セットアップ中...' : 'セットアップ完了'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// インラインアイコン
// ---------------------------------------------------------------------------

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
