/**
 * PACE Platform — ルーティング条件評価エンジン
 *
 * パース済みの RoutingCondition を現在のアセスメント回答状態に対して評価し、
 * 質問を表示すべきかどうかを判定する。
 *
 * 純粋関数として実装し、外部状態に依存しない。
 */

import type { RoutingCondition, SingleCondition } from './types';

// ---------------------------------------------------------------------------
// パブリック API
// ---------------------------------------------------------------------------

/**
 * ルーティング条件を評価し、質問を表示すべきかを判定する。
 *
 * @param condition - パース済みルーティング条件
 * @param responses - 現在の回答マップ（nodeId → 回答値）
 * @returns 条件が満たされている場合は true
 *
 * @example
 * ```ts
 * const responses = new Map([['P0_002', '下半身']]);
 *
 * evaluateCondition({ type: 'always' }, responses);
 * // → true
 *
 * evaluateCondition(
 *   { type: 'if', conditions: [{ nodeId: 'P0_002', operator: '=', value: '下半身' }] },
 *   responses
 * );
 * // → true
 *
 * evaluateCondition(
 *   { type: 'after', afterNodeId: 'PS_001' },
 *   responses
 * );
 * // → false（PS_001 が未回答の場合）
 * ```
 */
export function evaluateCondition(
  condition: RoutingCondition,
  responses: Map<string, string>,
): boolean {
  switch (condition.type) {
    case 'always':
      return true;

    case 'if':
      return evaluateIfCondition(condition, responses);

    case 'after':
      return evaluateAfterCondition(condition, responses);

    case 'compound':
      return evaluateCompoundCondition(condition, responses);

    default:
      // 未知の条件タイプはフォールバックとして表示する
      return true;
  }
}

// ---------------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------------

/**
 * "if" 条件を評価する。
 * conditions 配列内のすべての条件が満たされる場合に true を返す。
 */
function evaluateIfCondition(
  condition: RoutingCondition,
  responses: Map<string, string>,
): boolean {
  if (!condition.conditions || condition.conditions.length === 0) {
    return true;
  }

  // if タイプは単一条件だが、すべてを満たす必要がある
  return condition.conditions.every((c) =>
    evaluateSingleCondition(c, responses),
  );
}

/**
 * "after" 条件を評価する。
 * 指定ノードが回答済みの場合に true を返す。
 */
function evaluateAfterCondition(
  condition: RoutingCondition,
  responses: Map<string, string>,
): boolean {
  if (!condition.afterNodeId) {
    return true;
  }
  return responses.has(condition.afterNodeId);
}

/**
 * "compound" 条件を評価する。
 * AND の場合はすべての条件、OR の場合はいずれかの条件が満たされる場合に true。
 */
function evaluateCompoundCondition(
  condition: RoutingCondition,
  responses: Map<string, string>,
): boolean {
  if (!condition.conditions || condition.conditions.length === 0) {
    return true;
  }

  if (condition.operator === 'OR') {
    return condition.conditions.some((c) =>
      evaluateSingleCondition(c, responses),
    );
  }

  // AND（デフォルト）
  return condition.conditions.every((c) =>
    evaluateSingleCondition(c, responses),
  );
}

/**
 * 単一条件を評価する。
 *
 * 参照先ノードが未回答の場合は条件不成立（false）とする。
 * 値の比較は文字列完全一致（大文字小文字を区別）。
 */
function evaluateSingleCondition(
  condition: SingleCondition,
  responses: Map<string, string>,
): boolean {
  const actualValue = responses.get(condition.nodeId);

  // 未回答の場合は条件不成立
  if (actualValue === undefined) {
    return false;
  }

  switch (condition.operator) {
    case '=':
      return actualValue === condition.value;

    case '!=':
      return actualValue !== condition.value;

    case '>': {
      const numActual = Number(actualValue);
      const numExpected = Number(condition.value);
      if (isNaN(numActual) || isNaN(numExpected)) {
        // 数値変換不能の場合は文字列比較
        return actualValue > condition.value;
      }
      return numActual > numExpected;
    }

    case '<': {
      const numActual = Number(actualValue);
      const numExpected = Number(condition.value);
      if (isNaN(numActual) || isNaN(numExpected)) {
        return actualValue < condition.value;
      }
      return numActual < numExpected;
    }

    default:
      return false;
  }
}
