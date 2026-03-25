/**
 * PACE Platform — オンライン学習（Bayesian Online Learning）型定義
 *
 * DAGノードの尤度比（LR）をリアルワールドの受傷アウトカムに基づき
 * 自動更新するシステムの型を定義する。
 *
 * PRD Phase 2: 事後確率自動更新
 *   - 経験的 LR の算出（感度・特異度ベース）
 *   - 安全バウンド ±50%（逸脱時はヒューマンレビュー）
 *   - モデルバージョニングによるロールバック
 */

// ---------------------------------------------------------------------------
// 学習データポイント
// ---------------------------------------------------------------------------

/**
 * 個別の学習データポイント。
 *
 * アセスメント回答と実際の受傷アウトカムを紐づけたレコード。
 * 1〜4 週間以内の受傷発生有無を追跡する。
 */
export interface LearningDataPoint {
  /** アセスメントノードID */
  nodeId: string;
  /** ノードが陽性（Yes）と判定されたか */
  wasPositive: boolean;
  /** 実際に 1〜4 週間以内に受傷が発生したか */
  injuryOccurred: boolean;
  /** アセスメント実施日 */
  assessmentDate: Date;
  /** 受傷日（受傷が発生した場合のみ） */
  injuryDate?: Date | undefined;
}

// ---------------------------------------------------------------------------
// LR 更新結果
// ---------------------------------------------------------------------------

/**
 * 個別ノードの LR 更新結果。
 */
export interface LRUpdateResult {
  /** ノードID */
  nodeId: string;
  /** 更新前の LR 値 */
  previousLR: number;
  /** 更新後の LR 値 */
  updatedLR: number;
  /** サンプルサイズ */
  sampleSize: number;
  /** Wilson スコア信頼区間の幅（信頼度指標） */
  confidence: number;
  /** 安全バウンド内か（CSV 元値から ±50% 以内） */
  isWithinSafetyBounds: boolean;
}

// ---------------------------------------------------------------------------
// モデルバージョン
// ---------------------------------------------------------------------------

/** モデルバージョンのソース種別 */
export type ModelVersionSource =
  | "csv_baseline"
  | "bayesian_update"
  | "manual_override";

/**
 * モデルバージョンのスナップショット。
 *
 * 各バージョンはすべてのノードの LR 値を保持し、
 * 必要に応じてロールバック可能。
 */
export interface ModelVersion {
  /** バージョン文字列（例: "v1.0", "v1.1"） */
  version: string;
  /** 作成日時 */
  createdAt: Date;
  /** ノードID → LR値 のマップ */
  nodeWeights: Map<string, number>;
  /** バージョンのソース */
  source: ModelVersionSource;
  /** 手動承認した staff_id（該当する場合） */
  approvedBy?: string | undefined;
  /** 備考 */
  notes?: string | undefined;
}

// ---------------------------------------------------------------------------
// バッチ学習結果
// ---------------------------------------------------------------------------

/**
 * 週次バッチ学習処理の結果サマリー。
 */
export interface LearningBatchResult {
  /** 生成されたモデルバージョン */
  version: string;
  /** 更新対象ノード数 */
  updatedNodes: number;
  /** 安全バウンド内で自動更新されたノード数 */
  safeUpdates: number;
  /** 安全バウンドを超えヒューマンレビュー必要なノード数 */
  flaggedUpdates: number;
  /** データ不足でスキップされたノード数 */
  skippedNodes: number;
  /** 個別ノードの更新詳細 */
  details: LRUpdateResult[];
}

// ---------------------------------------------------------------------------
// LR 更新提案（ヒューマンレビュー対象）
// ---------------------------------------------------------------------------

/** 提案のステータス */
export type ProposalStatus = "pending" | "approved" | "rejected";

/**
 * LR 更新提案レコード。
 *
 * 安全バウンド（±50%）を超えた LR 更新は自動適用せず、
 * master ロールのスタッフによるレビューを必要とする。
 */
export interface LRUpdateProposal {
  /** 提案ID */
  id: string;
  /** ノードID */
  nodeId: string;
  /** 現在の LR 値 */
  currentLR: number;
  /** 提案された LR 値 */
  proposedLR: number;
  /** CSV ベースラインの LR 値 */
  originalCsvLR: number;
  /** CSV 値からの乖離率（%） */
  deviationPct: number;
  /** サンプルサイズ */
  sampleSize: number;
  /** 信頼度 */
  confidence: number;
  /** レビューステータス */
  status: ProposalStatus;
  /** レビューしたスタッフID */
  reviewedBy?: string | undefined;
  /** レビュー日時 */
  reviewedAt?: Date | undefined;
  /** バッチバージョン */
  batchVersion: string;
  /** 作成日時 */
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// API レスポンス型
// ---------------------------------------------------------------------------

/** 提案一覧レスポンス */
export interface ProposalsListResponse {
  success: true;
  data: {
    proposals: LRUpdateProposal[];
    totalCount: number;
  };
}

/** 提案レビューレスポンス */
export interface ProposalReviewResponse {
  success: true;
  data: {
    proposal: LRUpdateProposal;
    modelVersionCreated?: string | undefined;
  };
}

/** バージョン一覧レスポンス */
export interface VersionsListResponse {
  success: true;
  data: {
    versions: Array<{
      version: string;
      source: ModelVersionSource;
      createdAt: string;
      approvedBy?: string | undefined;
      notes?: string | undefined;
    }>;
  };
}

/** ロールバックレスポンス */
export interface RollbackResponse {
  success: true;
  data: {
    rolledBackTo: string;
    nodesRestored: number;
  };
}

/** 共通エラーレスポンス */
export interface LearningErrorResponse {
  success: false;
  error: string;
}
