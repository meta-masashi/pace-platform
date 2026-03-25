/**
 * PACE Platform — NLG テンプレートジェネレーター（決定論的フォールバック）
 *
 * Gemini がダウンしている場合でも必ず動作する、テンプレートベースの NLG エンジン。
 * 医学的根拠・数値・タグ名を正確に保持したエビデンステキストを生成する。
 *
 * テンプレート構造:
 *   {riskArea}のリスクがベースラインの{riskMultiplier}倍に上昇しています。
 *   【根拠】{nodeName}（{evidenceText}）のため。
 *   {blockedTags}を本日のメニューから除外し、{prescribedTags}を追加しました。
 */

import type {
  EvidenceAlert,
  AlertCard,
  AlertCardAction,
  AlertRiskLevel,
} from "./types";
import type { MenuDraft, ModificationEntry } from "../tags/types";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** リスクレベル判定の閾値 */
const RISK_THRESHOLDS = {
  /** Critical: リスク倍率 >= 3.0 */
  critical: 3.0,
  /** Watchlist: リスク倍率 >= 1.5 */
  watchlist: 1.5,
} as const;

/** リスクレベルのソート優先度（小さいほど優先） */
const RISK_LEVEL_ORDER: Record<AlertRiskLevel, number> = {
  critical: 0,
  watchlist: 1,
  normal: 2,
} as const;

/** アラートカードのアクションボタン定義 */
const ALERT_CARD_ACTIONS: AlertCardAction[] = [
  { type: "approve", label: "承認", color: "green" },
  { type: "modify", label: "修正して承認", color: "amber" },
  { type: "reject", label: "却下", color: "red" },
];

// ---------------------------------------------------------------------------
// パブリック API
// ---------------------------------------------------------------------------

/**
 * エビデンスアラートからテンプレートベースの NLG テキストを生成する。
 *
 * テンプレート:
 *   {riskArea}のリスクがベースラインの{riskMultiplier}倍に上昇しています。
 *   【根拠】{nodeName}（{evidenceText}）のため。
 *   本日のメニューから{blockedList}を除外し、{prescribedList}を追加しました。
 *
 * @param alert エビデンスアラート
 * @returns 生成されたテンプレートテキスト
 */
export function generateEvidenceTemplate(alert: EvidenceAlert): string {
  const parts: string[] = [];

  // リスク上昇テキスト
  const multiplierText = alert.riskMultiplier.toFixed(1);
  parts.push(
    `${alert.riskArea}のリスクがベースラインの${multiplierText}倍に上昇しています。`
  );

  // 根拠テキスト
  if (alert.nodeName && alert.evidenceText) {
    parts.push(`【根拠】${alert.nodeName}（${alert.evidenceText}）のため。`);
  }

  // メニュー修正テキスト
  const menuModText = buildMenuModificationText(alert);
  if (menuModText) {
    parts.push(menuModText);
  }

  return parts.join("");
}

/**
 * エビデンスアラート一覧とメニュードラフトから「7 AM Monopoly」アラートカード一覧を生成する。
 *
 * アラートカードはリスクレベル降順（Critical > Watchlist > Normal）でソートされる。
 *
 * @param alerts エビデンスアラート一覧
 * @param menus アスリートID → メニュードラフトのマップ
 * @returns ソート済みアラートカード一覧
 */
export function generateAlertCards(
  alerts: EvidenceAlert[],
  menus: Map<string, MenuDraft>
): AlertCard[] {
  const cards: AlertCard[] = [];

  // アスリート単位でアラートをグループ化
  const alertsByAthlete = groupAlertsByAthlete(alerts);

  for (const [athleteId, athleteAlerts] of alertsByAthlete) {
    // 最もリスクの高いアラートを主アラートとする
    const primaryAlert = athleteAlerts.reduce((max, current) =>
      current.riskMultiplier > max.riskMultiplier ? current : max
    );

    const riskLevel = determineRiskLevel(primaryAlert.riskMultiplier);
    const menu = menus.get(athleteId);

    // 全アラートの NLG テキストを統合
    const nlgText = athleteAlerts
      .map((a) => generateEvidenceTemplate(a))
      .join("\n");

    // 全アラートのエビデンストレイルを統合
    const evidenceTrail: ModificationEntry[] = athleteAlerts.flatMap(
      (a) => a.modifications
    );

    const card: AlertCard = {
      athleteId,
      athleteName: primaryAlert.athleteName,
      riskLevel,
      nlgText,
      modifiedMenu: menu ?? {
        athleteId,
        date: new Date().toISOString().split("T")[0]!,
        exercises: [],
        isModified: false,
        modifications: [],
      },
      actions: [...ALERT_CARD_ACTIONS],
      posteriorProbability: primaryAlert.posteriorProbability,
      riskMultiplier: primaryAlert.riskMultiplier,
      evidenceTrail,
    };

    cards.push(card);
  }

  // リスクレベル降順にソート（同レベルはリスク倍率降順）
  cards.sort((a, b) => {
    const levelDiff = RISK_LEVEL_ORDER[a.riskLevel] - RISK_LEVEL_ORDER[b.riskLevel];
    if (levelDiff !== 0) return levelDiff;
    return b.riskMultiplier - a.riskMultiplier;
  });

  return cards;
}

/**
 * リスク倍率からリスクレベルを判定する。
 *
 * @param riskMultiplier リスク倍率
 * @returns リスクレベル
 */
export function determineRiskLevel(riskMultiplier: number): AlertRiskLevel {
  if (riskMultiplier >= RISK_THRESHOLDS.critical) return "critical";
  if (riskMultiplier >= RISK_THRESHOLDS.watchlist) return "watchlist";
  return "normal";
}

// ---------------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------------

/**
 * メニュー修正テキストを構築する。
 * ブロックタグ・処方タグの両方がある場合は統合テキストを生成。
 */
function buildMenuModificationText(alert: EvidenceAlert): string | null {
  const hasBlocked = alert.blockedTags.length > 0;
  const hasPrescribed = alert.prescribedTags.length > 0;

  if (!hasBlocked && !hasPrescribed) return null;

  const parts: string[] = [];

  if (hasBlocked && hasPrescribed) {
    const blockedList = formatTagList(alert.blockedTags);
    const prescribedList = formatTagList(alert.prescribedTags);
    parts.push(
      `本日のメニューから${blockedList}を除外し、${prescribedList}を追加しました。`
    );
  } else if (hasBlocked) {
    const blockedList = formatTagList(alert.blockedTags);
    parts.push(`本日のメニューから${blockedList}を除外しました。`);
  } else if (hasPrescribed) {
    const prescribedList = formatTagList(alert.prescribedTags);
    parts.push(`本日のメニューに${prescribedList}を追加しました。`);
  }

  return parts.join("");
}

/**
 * タグ名のリストを表示用の日本語テキストに変換する。
 * 例: ["!#Sprinting", "!#ImpactLoad"] → "スプリント（!#Sprinting）・衝撃負荷（!#ImpactLoad）"
 */
function formatTagList(tags: string[]): string {
  return tags
    .map((tag) => {
      const displayName = tagToDisplayName(tag);
      return `${displayName}（${tag}）`;
    })
    .join("・");
}

/**
 * タグ名を日本語表示名に変換する。
 * マッピングにない場合はタグボディをそのまま返す。
 */
function tagToDisplayName(tag: string): string {
  const body = tag.replace(/^!?#/, "");
  return TAG_DISPLAY_NAMES[body] ?? body;
}

/** タグボディ → 日本語表示名のマッピング */
const TAG_DISPLAY_NAMES: Record<string, string> = {
  // 禁忌系
  Sprinting: "スプリント",
  ImpactLoad: "衝撃負荷",
  MaxEffort: "最大努力",
  Plyometric: "プライオメトリクス",
  HighVelocity: "高速動作",
  ContactDrill: "コンタクトドリル",
  DeepSquat: "ディープスクワット",
  OverheadLoad: "オーバーヘッド負荷",
  Rotation: "回旋動作",
  LateralCut: "ラテラルカット",
  // 処方系
  NM_NordicHamstring: "ノルディックハムストリング",
  Str_Hamstring_Eccentric: "ハムストリング・エキセントリック",
  Mob_HipFlexor: "股関節屈筋モビリティ",
  Str_Glute_Bridge: "グルートブリッジ",
  NM_BalanceBoard: "バランスボード",
  Str_Quad_Isometric: "大腿四頭筋アイソメトリック",
  Mob_AnkleDorsiflexion: "足関節背屈モビリティ",
  Str_Calf_Eccentric: "カーフ・エキセントリック",
  NM_Proprioception: "固有受容覚トレーニング",
  Str_Core_AntiRotation: "コア・アンチローテーション",
};

/**
 * アラート一覧をアスリート単位でグループ化する。
 */
function groupAlertsByAthlete(
  alerts: EvidenceAlert[]
): Map<string, EvidenceAlert[]> {
  const map = new Map<string, EvidenceAlert[]>();

  for (const alert of alerts) {
    const existing = map.get(alert.athleteId);
    if (existing) {
      existing.push(alert);
    } else {
      map.set(alert.athleteId, [alert]);
    }
  }

  return map;
}
