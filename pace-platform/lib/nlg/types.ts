/**
 * PACE Platform — NLG（自然言語生成）エビデンステキストエンジン 型定義
 *
 * 「7 AM Monopoly」自律メニュー生成のアラートカード・エビデンスサマリーの型。
 * テンプレート NLG（決定論的フォールバック）と Gemini 整形の両方をサポート。
 */

import type {
  ContraindicationTag,
  PrescriptionTag,
  ModificationEntry,
  MenuDraft,
} from "../tags/types";

// ---------------------------------------------------------------------------
// リスクレベル
// ---------------------------------------------------------------------------

/** アラートカードのリスクレベル（ソート優先度順） */
export type AlertRiskLevel = "critical" | "watchlist" | "normal";

// ---------------------------------------------------------------------------
// エビデンスアラート
// ---------------------------------------------------------------------------

/**
 * 1アスリートの1リスク領域に対するエビデンスアラート。
 * タグコンパイラの結果とベイズ推論の事後確率を統合した入力データ。
 */
export interface EvidenceAlert {
  /** アスリートID */
  athleteId: string;
  /** アスリート名（表示用） */
  athleteName: string;
  /** リスク領域（日本語）例: "ハムストリングスの肉離れ" */
  riskArea: string;
  /** 事後確率（0-1） */
  posteriorProbability: number;
  /** 事前確率（0-1） */
  priorProbability: number;
  /** リスク倍率（事後確率 / 事前確率） */
  riskMultiplier: number;
  /** 発火ノード名（根拠となるアセスメントノード） */
  nodeName: string;
  /** エビデンステキスト（学術参照）例: "Croisier JL et al. AJSM 2008" */
  evidenceText: string;
  /** ブロックされた禁忌タグ一覧 */
  blockedTags: ContraindicationTag[];
  /** 追加された処方タグ一覧 */
  prescribedTags: PrescriptionTag[];
  /** メニュー修正の詳細 */
  modifications: ModificationEntry[];
}

// ---------------------------------------------------------------------------
// NLG 結果
// ---------------------------------------------------------------------------

/**
 * NLG エンジンの出力結果。
 * テンプレートテキスト（常に生成）と Gemini 整形テキスト（オプション）を含む。
 */
export interface NLGResult {
  /** テンプレートベースの NLG テキスト（決定論的・フォールバック） */
  templateText: string;
  /** Gemini で整形されたテキスト（オプション — 失敗時は undefined） */
  geminiText?: string;
  /** Gemini が失敗してテンプレートにフォールバックしたか */
  isFallback: boolean;
  /** 元のアラート一覧 */
  alerts: EvidenceAlert[];
}

// ---------------------------------------------------------------------------
// アラートカード
// ---------------------------------------------------------------------------

/**
 * 「7 AM Monopoly」ダッシュボードに表示するアラートカード。
 * スタッフが承認・修正・却下を行う最小単位。
 */
export interface AlertCard {
  /** アスリートID */
  athleteId: string;
  /** アスリート名 */
  athleteName: string;
  /** リスクレベル（ソート・色分け用） */
  riskLevel: AlertRiskLevel;
  /** NLG テキスト（表示用 — Gemini 整形済み or テンプレート） */
  nlgText: string;
  /** 修正後のメニュードラフト */
  modifiedMenu: MenuDraft;
  /** アクションリスト（UI 用） */
  actions: AlertCardAction[];
  /** 事後確率 */
  posteriorProbability: number;
  /** リスク倍率 */
  riskMultiplier: number;
  /** エビデンストレイル（監査用） */
  evidenceTrail: ModificationEntry[];
}

/**
 * アラートカードに表示するアクションボタン。
 */
export interface AlertCardAction {
  /** アクション種別 */
  type: "approve" | "modify" | "reject";
  /** ボタンラベル（日本語） */
  label: string;
  /** ボタンの色テーマ */
  color: "green" | "amber" | "red";
}

// ---------------------------------------------------------------------------
// Morning Agenda API レスポンス
// ---------------------------------------------------------------------------

/**
 * GET /api/morning-agenda のレスポンス型。
 */
export interface MorningAgendaResponse {
  success: true;
  data: {
    /** 日付（YYYY-MM-DD） */
    date: string;
    /** アラートカード一覧（リスクレベル降順） */
    alertCards: AlertCard[];
    /** チームサマリー */
    teamSummary: {
      /** 総アスリート数 */
      totalAthletes: number;
      /** Critical アラート数 */
      criticalCount: number;
      /** Watchlist アラート数 */
      watchlistCount: number;
      /** Normal アラート数 */
      normalCount: number;
    };
  };
}

/**
 * Morning Agenda API エラーレスポンス型。
 */
export interface MorningAgendaErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// 承認 API
// ---------------------------------------------------------------------------

/**
 * POST /api/approval のリクエストボディ。
 */
export interface ApprovalRequest {
  /** アスリートID */
  athleteId: string;
  /** 日付（YYYY-MM-DD） */
  date: string;
  /** アクション種別 */
  action: "approve" | "modify" | "reject";
  /** 修正後のメニュー（action="modify" の場合のみ） */
  modifiedMenu?: MenuDraft;
  /** エビデンススナップショット（WORM ログ用） */
  evidenceSnapshot: {
    /** NLG テキスト */
    nlgText: string;
    /** エビデンストレイル */
    evidenceTrail: ModificationEntry[];
    /** リスク倍率 */
    riskMultiplier: number;
    /** 事後確率 */
    posteriorProbability: number;
  };
}

/**
 * POST /api/approval のレスポンス型。
 */
export interface ApprovalResponse {
  success: true;
  data: {
    /** 承認ログID（WORM） */
    logId: string;
    /** アクション結果 */
    action: "approve" | "modify" | "reject";
    /** 確認日時 */
    confirmedAt: string;
  };
}
