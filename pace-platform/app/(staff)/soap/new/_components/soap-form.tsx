'use client';

/**
 * PACE Platform — SOAPノート作成フォーム
 *
 * 4つのテキストエリア（S/O/A/P）を持つフォーム。
 * 各フィールドに対してAI生成が可能。
 * AI生成された内容は黄色背景で表示される。
 */

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AiGenerateButton } from './ai-generate-button';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface SoapField {
  key: 'sText' | 'oText' | 'aText' | 'pText';
  label: string;
  shortLabel: string;
  placeholder: string;
}

const SOAP_FIELDS: SoapField[] = [
  {
    key: 'sText',
    label: '主観的所見（Subjective）',
    shortLabel: 'S',
    placeholder: '選手の主訴、自覚症状、痛みの程度（NRS）、日常生活への影響...',
  },
  {
    key: 'oText',
    label: '客観的所見（Objective）',
    shortLabel: 'O',
    placeholder: '視診・触診所見、測定値、特殊テスト結果、関節可動域...',
  },
  {
    key: 'aText',
    label: '評価（Assessment）',
    shortLabel: 'A',
    placeholder: '臨床的評価、鑑別診断候補、リスクレベル、寄与因子...',
  },
  {
    key: 'pText',
    label: '計画（Plan）',
    shortLabel: 'P',
    placeholder: '治療計画、リハビリ方針、専門家紹介検討、フォローアップ時期...',
  },
];

const MIN_CHARS = 10;

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function SoapForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const athleteIdParam = searchParams.get('athleteId') ?? '';

  const [athleteId, setAthleteId] = useState(athleteIdParam);
  const [fields, setFields] = useState({
    sText: '',
    oText: '',
    aText: '',
    pText: '',
  });
  const [aiGenerated, setAiGenerated] = useState({
    sText: false,
    oText: false,
    aText: false,
    pText: false,
  });
  const [fieldLoading, setFieldLoading] = useState({
    sText: false,
    oText: false,
    aText: false,
    pText: false,
  });
  const [allLoading, setAllLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  /**
   * AI生成を呼び出して全フィールドを取得し、指定フィールドのみ適用する
   */
  const generateField = useCallback(
    async (fieldKey?: 'sText' | 'oText' | 'aText' | 'pText') => {
      if (!athleteId) {
        setError('アスリートIDを入力してください。');
        return;
      }

      setError(null);

      if (fieldKey) {
        setFieldLoading((prev) => ({ ...prev, [fieldKey]: true }));
      } else {
        setAllLoading(true);
      }

      try {
        const res = await fetch('/api/soap/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ athleteId }),
        });

        const json = await res.json();

        if (!json.success) {
          setError(json.error ?? 'AI生成に失敗しました。');
          return;
        }

        const data = json.data as {
          sText: string;
          oText: string;
          aText: string;
          pText: string;
        };

        if (fieldKey) {
          // 指定フィールドのみ更新
          setFields((prev) => ({ ...prev, [fieldKey]: data[fieldKey] }));
          setAiGenerated((prev) => ({ ...prev, [fieldKey]: true }));
        } else {
          // 全フィールド更新
          setFields({
            sText: data.sText,
            oText: data.oText,
            aText: data.aText,
            pText: data.pText,
          });
          setAiGenerated({
            sText: true,
            oText: true,
            aText: true,
            pText: true,
          });
        }
      } catch {
        setError('ネットワークエラーが発生しました。');
      } finally {
        if (fieldKey) {
          setFieldLoading((prev) => ({ ...prev, [fieldKey]: false }));
        } else {
          setAllLoading(false);
        }
      }
    },
    [athleteId]
  );

  /**
   * フィールド値の変更ハンドラ
   */
  const handleFieldChange = (key: 'sText' | 'oText' | 'aText' | 'pText', value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    // ユーザーが編集した場合はAIフラグを解除しない（黄色背景は維持）
  };

  /**
   * 保存ハンドラ
   */
  const handleSave = async () => {
    setError(null);

    if (!athleteId) {
      setError('アスリートIDを入力してください。');
      return;
    }

    // バリデーション
    for (const field of SOAP_FIELDS) {
      if (fields[field.key].length < MIN_CHARS) {
        setError(`${field.label}は${MIN_CHARS}文字以上必要です。`);
        return;
      }
    }

    setSaving(true);

    try {
      const hasAi = Object.values(aiGenerated).some(Boolean);

      const res = await fetch('/api/soap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId,
          sText: fields.sText,
          oText: fields.oText,
          aText: fields.aText,
          pText: fields.pText,
          aiAssisted: hasAi,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error ?? 'SOAPノートの保存に失敗しました。');
        return;
      }

      setSuccess(true);

      // 保存成功後、選手詳細ページに戻る
      setTimeout(() => {
        router.push(`/athletes/${athleteId}`);
      }, 1500);
    } catch {
      setError('ネットワークエラーが発生しました。');
    } finally {
      setSaving(false);
    }
  };

  const isAnyLoading = allLoading || Object.values(fieldLoading).some(Boolean);

  return (
    <div className="space-y-6">
      {/* アスリートID入力 */}
      <div className="space-y-2">
        <label
          htmlFor="athlete-id"
          className="text-sm font-medium text-foreground"
        >
          アスリートID
        </label>
        <input
          id="athlete-id"
          type="text"
          value={athleteId}
          onChange={(e) => setAthleteId(e.target.value)}
          placeholder="アスリートIDを入力"
          disabled={!!athleteIdParam}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
        />
      </div>

      {/* 全セクションAI生成ボタン */}
      <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div>
          <p className="text-sm font-medium text-emerald-900">
            AI補助で全セクションを生成
          </p>
          <p className="text-xs text-emerald-700">
            アスリートのデータに基づいてS/O/A/P全てを生成します
          </p>
        </div>
        <AiGenerateButton
          onClick={() => generateField()}
          loading={allLoading}
          label="全セクションAI生成"
          disabled={!athleteId || isAnyLoading}
        />
      </div>

      {/* SOAPフィールド */}
      {SOAP_FIELDS.map((field) => (
        <div key={field.key} className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor={field.key}
              className="text-sm font-medium text-foreground"
            >
              <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
                {field.shortLabel}
              </span>
              {field.label}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {fields[field.key].length}文字
              </span>
              <AiGenerateButton
                onClick={() => generateField(field.key)}
                loading={fieldLoading[field.key]}
                label="AI生成"
                disabled={!athleteId || isAnyLoading}
              />
            </div>
          </div>
          <textarea
            id={field.key}
            value={fields[field.key]}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            rows={5}
            className={`w-full rounded-md border px-3 py-2 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 ${
              aiGenerated[field.key]
                ? 'border-amber-300 bg-amber-50'
                : 'border-input bg-background'
            }`}
          />
          {aiGenerated[field.key] && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700">
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
              </svg>
              AI生成コンテンツ — 内容を確認・編集してください
            </div>
          )}
          {fields[field.key].length > 0 && fields[field.key].length < MIN_CHARS && (
            <p className="text-xs text-critical-600">
              {MIN_CHARS}文字以上入力してください（現在: {fields[field.key].length}文字）
            </p>
          )}
        </div>
      ))}

      {/* 免責事項 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-medium text-amber-800">
          ※ AI生成内容は参考情報です。最終判断は有資格スタッフが行ってください。
        </p>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="rounded-md border border-critical-200 bg-critical-50 px-3 py-2">
          <p className="text-sm text-critical-700">{error}</p>
        </div>
      )}

      {/* 成功表示 */}
      {success && (
        <div className="rounded-md border border-optimal-200 bg-optimal-50 px-3 py-2">
          <p className="text-sm text-optimal-700">
            SOAPノートを保存しました。選手詳細ページに移動します...
          </p>
        </div>
      )}

      {/* 保存ボタン */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || isAnyLoading || success}
        className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
      >
        {saving ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            保存中...
          </span>
        ) : (
          '保存'
        )}
      </button>
    </div>
  );
}
