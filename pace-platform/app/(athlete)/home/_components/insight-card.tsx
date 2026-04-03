"use client";

/**
 * AI インサイトカード
 *
 * 所属組織が Pro 契約の場合: Gemini NLG による日本語アドバイスを表示
 * Standard 契約 or LLM ダウン時: Readiness ゾーンに基づくテンプレートテキストを表示
 *
 * M20: 全 AI 出力に医療免責事項を表示。
 */

const MEDICAL_DISCLAIMER =
  "※ この出力はAIによる補助情報です。最終的な判断・処置は必ず有資格スタッフが行ってください。";

/** LLM ダウン時 / Standard プラン用フォールバックテンプレート */
const FALLBACK_TEMPLATES = {
  excellent: "絶好調です！今日は積極的にトレーニングできます。",
  good: "コンディションは良好です。通常メニューで問題ありません。",
  watch: "少し疲労が溜まっています。無理せず調整しましょう。",
  critical: "体調管理に注意が必要です。スタッフに相談してください。",
} as const;

/** スコアからフォールバックテンプレートを選択 */
function selectFallbackTemplate(score: number): string {
  if (score >= 85) return FALLBACK_TEMPLATES.excellent;
  if (score >= 70) return FALLBACK_TEMPLATES.good;
  if (score >= 40) return FALLBACK_TEMPLATES.watch;
  return FALLBACK_TEMPLATES.critical;
}

interface InsightCardProps {
  /** AI 生成インサイトテキスト（Pro + LLM 正常時のみ） */
  insight?: string | undefined;
  /** コンディションスコア（フォールバック選択用） */
  score?: number | undefined;
}

function LightbulbIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-watchlist-500"
    >
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 019 14" />
    </svg>
  );
}

export function InsightCard({ insight, score = 50 }: InsightCardProps) {
  const displayText = insight || selectFallbackTemplate(score);

  return (
    <div className="animate-fade-in-up rounded-xl border border-border bg-gradient-to-br from-card to-secondary/30 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-watchlist-100 p-1.5">
          <LightbulbIcon />
        </div>
        <div className="flex-1">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            💡 今日のアドバイス
          </h3>
          <p className="text-sm leading-relaxed text-foreground">{displayText}</p>
        </div>
      </div>
      {/* M20: 医療免責事項 */}
      <p className="mt-3 border-t border-border/50 pt-2 text-[11px] leading-snug text-muted-foreground">
        {MEDICAL_DISCLAIMER}
      </p>
    </div>
  );
}
