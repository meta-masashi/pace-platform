/**
 * PACE Platform — ルーティングエンジン バレルエクスポート
 *
 * Routing_v4.3 パーサーと条件評価エンジン。
 * アセスメントウィザードの質問フロー制御に使用する。
 */

// 型定義
export type {
  RoutingConditionType,
  LogicalOperator,
  ComparisonOperator,
  SingleCondition,
  RoutingCondition,
  RoutingRule,
} from './types';

// パーサー
export { parseRoutingRule } from './parser';

// 評価エンジン
export { evaluateCondition } from './evaluator';
