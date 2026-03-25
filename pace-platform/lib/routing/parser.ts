/**
 * PACE Platform — Routing_v4.3 パーサー
 *
 * CSVの Routing_v4.3 カラムに記述される自然言語ルーティングルールを
 * 正規表現ベースで構造化データ（RoutingCondition）にパースする。
 *
 * 対応フォーマット:
 *   - "Always"                         → { type: 'always' }
 *   - "If P0_002=下半身"               → { type: 'if', conditions: [...] }
 *   - "If P0_001=全身代謝 AND A3_N03=Yes" → { type: 'compound', operator: 'AND', conditions: [...] }
 *   - "If F2_001=Yes OR F2_002=Yes"    → { type: 'compound', operator: 'OR', conditions: [...] }
 *   - "After PS_001"                   → { type: 'after', afterNodeId: 'PS_001' }
 *   - 空/null/undefined/不正           → { type: 'always' }（フォールバック）
 *
 * 日本語の値（例: "下半身", "全身代謝"）を正しく処理する。
 */

import type {
  RoutingCondition,
  SingleCondition,
  ComparisonOperator,
} from './types';

// ---------------------------------------------------------------------------
// 正規表現パターン
// ---------------------------------------------------------------------------

/**
 * 単一条件パターン: "NODE_ID operator VALUE"
 * ノードIDは英数字+アンダースコア、値は日本語を含む任意の文字列。
 * 対応演算子: =, !=, >, <
 */
const SINGLE_CONDITION_RE =
  /([A-Za-z0-9_]+)\s*(!=|=|>|<)\s*(.+)/;

/**
 * "After NODE_ID" パターン
 */
const AFTER_RE = /^After\s+([A-Za-z0-9_]+)\s*$/i;

/**
 * "Always" パターン
 */
const ALWAYS_RE = /^Always$/i;

/**
 * AND/OR 分割用パターン（大文字のみマッチ）
 * 日本語の値内に "AND"/"OR" が含まれるケースは実用上発生しないと想定。
 */
const AND_SPLIT_RE = /\s+AND\s+/;
const OR_SPLIT_RE = /\s+OR\s+/;

// ---------------------------------------------------------------------------
// パブリック API
// ---------------------------------------------------------------------------

/**
 * Routing_v4.3 テキストを RoutingCondition にパースする。
 *
 * 不正な入力（null, undefined, 空文字列, パース不能文字列）の場合は
 * フォールバックとして { type: 'always' } を返す。
 *
 * @param rawText - Routing_v4.3 カラムの文字列
 * @returns パース済み RoutingCondition
 *
 * @example
 * ```ts
 * parseRoutingRule('Always');
 * // → { type: 'always' }
 *
 * parseRoutingRule('If P0_002=下半身');
 * // → { type: 'if', conditions: [{ nodeId: 'P0_002', operator: '=', value: '下半身' }] }
 *
 * parseRoutingRule('If P0_001=全身代謝 AND A3_N03=Yes');
 * // → { type: 'compound', operator: 'AND', conditions: [...] }
 * ```
 */
export function parseRoutingRule(rawText: string | null | undefined): RoutingCondition {
  // null / undefined / 空文字列 → always
  if (!rawText || rawText.trim() === '') {
    return { type: 'always' };
  }

  const trimmed = rawText.trim();

  // "Always"
  if (ALWAYS_RE.test(trimmed)) {
    return { type: 'always' };
  }

  // "After NODE_ID"
  const afterMatch = trimmed.match(AFTER_RE);
  if (afterMatch) {
    return {
      type: 'after',
      afterNodeId: afterMatch[1]!,
    };
  }

  // "If ..." 条件
  if (/^If\s+/i.test(trimmed)) {
    return parseIfCondition(trimmed);
  }

  // パース不能 → always にフォールバック
  console.warn(`[routing:parser] パース不能なルーティング文字列: "${rawText}"`);
  return { type: 'always' };
}

// ---------------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------------

/**
 * "If ..." 形式の条件文字列をパースする。
 * AND/OR を含む場合は compound、単一条件の場合は if を返す。
 */
function parseIfCondition(text: string): RoutingCondition {
  // "If " プレフィックスを除去
  const body = text.replace(/^If\s+/i, '').trim();

  // AND/OR の検出
  const hasAnd = AND_SPLIT_RE.test(body);
  const hasOr = OR_SPLIT_RE.test(body);

  // AND と OR が混在する場合は AND を優先（一般的な論理演算の慣習）
  if (hasAnd || hasOr) {
    const operator = hasAnd ? 'AND' : 'OR';
    const splitter = hasAnd ? AND_SPLIT_RE : OR_SPLIT_RE;
    const parts = body.split(splitter);

    const conditions: SingleCondition[] = [];
    for (const part of parts) {
      const cond = parseSingleCondition(part.trim());
      if (cond) {
        conditions.push(cond);
      }
    }

    if (conditions.length === 0) {
      console.warn(`[routing:parser] 複合条件のパースに失敗: "${text}"`);
      return { type: 'always' };
    }

    if (conditions.length === 1) {
      return {
        type: 'if',
        conditions,
      };
    }

    return {
      type: 'compound',
      operator: operator as 'AND' | 'OR',
      conditions,
    };
  }

  // 単一条件
  const condition = parseSingleCondition(body);
  if (!condition) {
    console.warn(`[routing:parser] 単一条件のパースに失敗: "${text}"`);
    return { type: 'always' };
  }

  return {
    type: 'if',
    conditions: [condition],
  };
}

/**
 * "NODE_ID=VALUE" 形式の単一条件をパースする。
 *
 * @param text - 条件テキスト（例: "P0_002=下半身"）
 * @returns パース済み SingleCondition、パース失敗時は null
 */
function parseSingleCondition(text: string): SingleCondition | null {
  const match = text.match(SINGLE_CONDITION_RE);
  if (!match) {
    return null;
  }

  return {
    nodeId: match[1]!,
    operator: match[2]! as ComparisonOperator,
    value: match[3]!.trim(),
  };
}
