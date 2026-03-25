/**
 * PACE Platform — Routing_v4.3 型定義
 *
 * CSVの Routing_v4.3 カラムに記述される自然言語ルーティングルールを
 * 構造化するための型定義。アセスメントウィザードの質問フロー制御に使用する。
 *
 * ルーティングルールの種類:
 *   - always: 常に表示（デフォルト）
 *   - if: 条件付き表示（単一条件）
 *   - compound: 複合条件（AND/OR）
 *   - after: 特定ノード回答後に表示
 */

// ---------------------------------------------------------------------------
// ルーティング条件の種類
// ---------------------------------------------------------------------------

/** ルーティング条件タイプ */
export type RoutingConditionType = 'always' | 'if' | 'after' | 'compound';

/** 複合条件の論理演算子 */
export type LogicalOperator = 'AND' | 'OR';

/** 比較演算子 */
export type ComparisonOperator = '=' | '!=' | '>' | '<';

// ---------------------------------------------------------------------------
// 条件インターフェース
// ---------------------------------------------------------------------------

/**
 * 単一条件。
 * "P0_002=下半身" のような個別の条件を表す。
 */
export interface SingleCondition {
  /** 参照先ノードID（例: "P0_002"） */
  nodeId: string;
  /** 比較演算子 */
  operator: ComparisonOperator;
  /** 比較値（日本語値を含む、例: "下半身"） */
  value: string;
}

/**
 * ルーティング条件。
 * パースされた Routing_v4.3 文字列の構造化表現。
 */
export interface RoutingCondition {
  /** 条件タイプ */
  type: RoutingConditionType;
  /** 条件リスト（if / compound 時に使用） */
  conditions?: SingleCondition[];
  /** 論理演算子（compound 時に使用） */
  operator?: LogicalOperator;
  /** After 対象ノードID（after 時に使用） */
  afterNodeId?: string;
}

// ---------------------------------------------------------------------------
// ルーティングルール
// ---------------------------------------------------------------------------

/**
 * パース済みルーティングルール。
 * ノードIDと条件、元テキストを保持する。
 */
export interface RoutingRule {
  /** このルールが適用されるノードID */
  nodeId: string;
  /** パース済み条件 */
  condition: RoutingCondition;
  /** 元の Routing_v4.3 テキスト（デバッグ・表示用） */
  rawText: string;
}
