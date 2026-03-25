/**
 * サッカー専用ドメイン定数
 * Activity Mapper / ポジション / MD タイムライン / コピー
 */

// ─── Activity Mapper: 負荷 → サッカーメニュー翻訳 ──────────────────────────

export interface ActivityLevel {
  min: number;
  max: number;
  menu: string;
  shortLabel: string;
  color: string; // Tailwind class
}

export const ACTIVITY_MAP: ActivityLevel[] = [
  {
    min: 0,
    max: 200,
    menu: "リカバリー・トレーニング（鳥かご 15分、ジョグ、ストレッチ）",
    shortLabel: "コンディション調整",
    color: "text-blue-400",
  },
  {
    min: 200,
    max: 500,
    menu: "標準的なタクティカル練習（対人 1vs1、シュート練習、部分戦術 60分）",
    shortLabel: "通常練習 / 戦術確認",
    color: "text-brand-400",
  },
  {
    min: 500,
    max: 800,
    menu: "高強度インテンシティ練習（5vs5 SSG 15分×4本、ポゼッション）",
    shortLabel: "追い込み / ゲーム形式",
    color: "text-amber-400",
  },
  {
    min: 800,
    max: Infinity,
    menu: "マッチ・インテンシティ（11vs11 フルピッチ紅白戦、または公式戦 90分）",
    shortLabel: "マッチ / 11対11",
    color: "text-red-400",
  },
];

export function getActivityLevel(load: number): ActivityLevel {
  return (
    ACTIVITY_MAP.find((a) => load >= a.min && load < a.max) ??
    ACTIVITY_MAP[ACTIVITY_MAP.length - 1]!
  );
}

/** What-If スライダー (0-200%) を実負荷に変換 */
export function scaleToLoad(scalePct: number, baseLoad: number = 500): number {
  return Math.round((scalePct / 100) * baseLoad);
}

// ─── ポジション定義 ─────────────────────────────────────────────────────────

export type FootballPosition = "GK" | "DF" | "MF" | "FW";

export const POSITION_CONFIG: Record<
  FootballPosition,
  { label: string; color: string; bgColor: string }
> = {
  GK: { label: "GK", color: "text-amber-600", bgColor: "bg-amber-50" },
  DF: { label: "DF", color: "text-blue-600", bgColor: "bg-blue-50" },
  MF: { label: "MF", color: "text-brand-600", bgColor: "bg-brand-50" },
  FW: { label: "FW", color: "text-red-600", bgColor: "bg-red-50" },
};

export function parsePosition(position: string | null): FootballPosition | null {
  if (!position) return null;
  const upper = position.toUpperCase().trim();
  if (upper.includes("GK") || upper.includes("キーパー")) return "GK";
  if (upper.includes("DF") || upper.includes("CB") || upper.includes("SB") || upper.includes("ディフェンス")) return "DF";
  if (upper.includes("MF") || upper.includes("ボランチ") || upper.includes("ミッドフィルダー")) return "MF";
  if (upper.includes("FW") || upper.includes("CF") || upper.includes("フォワード") || upper.includes("ウィング")) return "FW";
  return null;
}

// ─── MD (マッチデイ) タイムライン ────────────────────────────────────────────

/**
 * 日付をMD表記に変換
 * @param date 対象日
 * @param matchDate 次の試合日
 * @returns "MD-3", "MD", "MD+1" など
 */
export function toMatchDayLabel(date: Date, matchDate: Date): string {
  const diffMs = date.getTime() - matchDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "MD";
  if (diffDays < 0) return `MD${diffDays}`;
  return `MD+${diffDays}`;
}

/**
 * MD-1 処方箋テキスト生成
 */
export function getMdPrescription(
  mdOffset: number,
  loadPct: number,
  predictedStatus: "GREEN" | "YELLOW" | "RED"
): string {
  if (mdOffset === -1) {
    if (loadPct <= 40) {
      return "前日のセットプレー練習（Load 200）に抑えれば、当日のコンディションは PRIME（フレッシュ）に回復します。";
    }
    return "前日の負荷が高すぎます。軽めのタクティカル確認に切り替えてください。";
  }

  if (mdOffset === 0) {
    if (predictedStatus === "GREEN") return "試合当日：出場可能（Ready）— フルパフォーマンスが期待できます。";
    if (predictedStatus === "YELLOW") return "試合当日：出場可能ですが、後半途中交代を推奨します。";
    return "試合当日：別メニュー（Restricted）を推奨 — 無理をさせないでください。";
  }

  if (mdOffset === 1) return "MD+1：アクティブリカバリー（鳥かご + ストレッチ）を推奨。";
  if (mdOffset <= -2) {
    const level = getActivityLevel(scaleToLoad(loadPct));
    return `${level.shortLabel}で負荷をかけても安全圏です。`;
  }

  return "";
}

// ─── サッカー版 UI コピー ───────────────────────────────────────────────────

export const FOOTBALL_COPY = {
  morningCheckin: "モーニング・チェック（体調報告）",
  legHeaviness: "足のハリ / 重さ",
  readyStatus: "出場可能（Ready）",
  restrictedStatus: "別メニュー（Restricted）",
  postSessionInput: "今日の練習強度",
  bestCondition: "絶好調",

  // Bio-Swipe カード質問 (サッカー版)
  questions: {
    sleep: "昨晩はよく眠れましたか？",
    legHeaviness: "足のハリ / 重さはありますか？",
    hamstring: "ハムストリングに張りがありますか？",
    knee: "膝に違和感がありますか？",
    ankle: "足首に不安はありますか？",
    mental: "今日の試合 / 練習に集中できそうですか？",
  },

  // sRPE ラベル (サッカー版)
  srpeLabels: [
    "全く疲れない",       // 0
    "非常に楽",           // 1
    "楽（アップ程度）",    // 2
    "やや楽",             // 3
    "普通（戦術確認）",    // 4
    "ややキツい",         // 5
    "キツい（SSG）",      // 6
    "かなりキツい",       // 7
    "非常にキツい（紅白戦）", // 8
    "極めてキツい",       // 9
    "限界（フル90分）",    // 10
  ],
} as const;
