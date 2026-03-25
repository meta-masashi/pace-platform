/**
 * PACE Platform — レポート生成 型定義
 *
 * MDTミーティング用の選手レポート・チームレポートに使用する
 * データ構造およびオプションの型を定義する。
 */

// ---------------------------------------------------------------------------
// SOAPノート要約
// ---------------------------------------------------------------------------

/** SOAPノートの要約情報 */
export interface SOAPSummary {
  /** SOAPノート ID */
  id: string;
  /** 主観的所見 (Subjective) */
  sText: string;
  /** 客観的所見 (Objective) */
  oText: string;
  /** アセスメント (Assessment) */
  aText: string;
  /** 計画 (Plan) */
  pText: string;
  /** 作成日時 */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// リスクアセスメント
// ---------------------------------------------------------------------------

/** リスク評価結果 */
export interface RiskAssessment {
  /** ベイジアンネットワークのノード ID */
  nodeId: string;
  /** ノード名（日本語） */
  nodeName: string;
  /** リスクレベル（0〜1 の事後確率） */
  riskLevel: number;
  /** エビデンステキスト */
  evidenceText: string;
}

// ---------------------------------------------------------------------------
// メニュー変更
// ---------------------------------------------------------------------------

/** メニュー変更エントリ */
export interface MenuModification {
  /** 変更種別: ブロック（除外）または挿入 */
  type: 'block' | 'insert';
  /** 対象エクササイズ名 */
  exerciseName: string;
  /** 変更理由 */
  reason: string;
  /** 変更日時 */
  appliedAt: string;
}

// ---------------------------------------------------------------------------
// リハビリ要約
// ---------------------------------------------------------------------------

/** リハビリプログラムの進捗要約 */
export interface RehabSummary {
  /** プログラム ID */
  programId: string;
  /** 診断コード */
  diagnosisCode: string;
  /** 現在のフェーズ (1〜4) */
  currentPhase: number;
  /** プログラムステータス */
  status: 'active' | 'completed' | 'on_hold';
  /** 開始日 */
  startDate: string;
  /** 推定 RTP 日 */
  estimatedRtpDate: string | null;
  /** 現在フェーズのゲート充足状態 */
  gateStatus: 'met' | 'not_met';
}

// ---------------------------------------------------------------------------
// 減衰ステータス
// ---------------------------------------------------------------------------

/** 減衰エントリ（データの鮮度） */
export interface DecayEntry {
  /** 指標名 */
  metricName: string;
  /** 最終更新日時 */
  lastUpdated: string;
  /** 減衰率（0〜1。1.0 が完全に新鮮） */
  freshness: number;
}

// ---------------------------------------------------------------------------
// レポートデータ
// ---------------------------------------------------------------------------

/** 選手レポートに必要な全データ */
export interface ReportData {
  /** 選手情報 */
  athlete: {
    name: string;
    position: string;
    number: string;
  };
  /** レポート日付 */
  date: string;
  /** コンディショニングスコア（0〜100） */
  conditioningScore: number;
  /** ACWR（Acute:Chronic Workload Ratio） */
  acwr: number;
  /** リスクアセスメント結果一覧 */
  riskAssessments: RiskAssessment[];
  /** メニュー変更一覧 */
  menuModifications: MenuModification[];
  /** SOAPノート一覧（最新のもの） */
  soapNotes: SOAPSummary[];
  /** リハビリ進捗（該当する場合） */
  rehabProgress?: RehabSummary | undefined;
  /** データ減衰ステータス（該当する場合） */
  decayStatus?: DecayEntry[] | undefined;
}

// ---------------------------------------------------------------------------
// レポートオプション
// ---------------------------------------------------------------------------

/** レポート生成オプション */
export interface ReportOptions {
  /** レポート形式: summary は概要のみ、detailed は全項目 */
  format: 'summary' | 'detailed';
  /** チャートを含めるか */
  includeCharts: boolean;
  /** 出力言語（日本語のみ対応） */
  language: 'ja';
}
