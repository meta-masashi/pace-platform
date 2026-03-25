/**
 * PACE Platform -- インポートデータバリデーションユーティリティ
 *
 * CSV / Excel から読み込んだ行データを検証するための関数群。
 */

// ---------------------------------------------------------------------------
// 必須フィールド検証
// ---------------------------------------------------------------------------

/**
 * 指定フィールドが空でないことを検証する。
 *
 * @param row - 検証対象の行データ
 * @param fields - 必須フィールド名の配列
 * @returns エラーメッセージの配列（エラーがなければ空配列）
 */
export function validateRequired(
  row: Record<string, string>,
  fields: string[],
): string[] {
  const errors: string[] = [];

  for (const field of fields) {
    const value = row[field];
    if (value === undefined || value === null || value.trim() === "") {
      errors.push(`必須フィールド "${field}" が空です`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 数値検証
// ---------------------------------------------------------------------------

/**
 * 値が有効な数値であることを検証する。
 *
 * @param value - 検証する値（文字列）
 * @param field - フィールド名（エラーメッセージ用）
 * @param min - 最小値（省略可）
 * @param max - 最大値（省略可）
 * @returns エラーメッセージ、または null（エラーなし）
 */
export function validateNumeric(
  value: string,
  field: string,
  min?: number,
  max?: number,
): string | null {
  // 空値はオプショナルとして許容（必須チェックは validateRequired で行う）
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }

  const num = Number(value);

  if (isNaN(num)) {
    return `"${field}" は数値である必要があります（値: "${value}"）`;
  }

  if (min !== undefined && num < min) {
    return `"${field}" は ${min} 以上である必要があります（値: ${num}）`;
  }

  if (max !== undefined && num > max) {
    return `"${field}" は ${max} 以下である必要があります（値: ${num}）`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// JSON 検証
// ---------------------------------------------------------------------------

/**
 * 値が有効な JSON であることを検証する。
 *
 * @param value - 検証する値（文字列）
 * @param field - フィールド名（エラーメッセージ用）
 * @returns エラーメッセージ、または null（エラーなし）
 */
export function validateJson(
  value: string,
  field: string,
): string | null {
  // 空値は許容
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }

  try {
    JSON.parse(value);
    return null;
  } catch {
    return `"${field}" は有効な JSON である必要があります（値: "${value.substring(0, 50)}..."）`;
  }
}

// ---------------------------------------------------------------------------
// 列挙値検証
// ---------------------------------------------------------------------------

/**
 * 値が許可されたリストに含まれることを検証する。
 *
 * @param value - 検証する値（文字列）
 * @param field - フィールド名（エラーメッセージ用）
 * @param allowed - 許可される値の配列
 * @returns エラーメッセージ、または null（エラーなし）
 */
export function validateEnum(
  value: string,
  field: string,
  allowed: string[],
): string | null {
  // 空値は許容
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }

  if (!allowed.includes(value.trim())) {
    return `"${field}" は [${allowed.join(", ")}] のいずれかである必要があります（値: "${value}"）`;
  }

  return null;
}
