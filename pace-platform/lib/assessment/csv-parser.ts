/**
 * lib/assessment/csv-parser.ts
 * ============================================================
 * Assessment Nodes CSV パーサー（M7）
 *
 * assessment_nodes テーブルへのインポート用 CSV を解析・バリデーションする。
 *
 * CSVヘッダー（必須）:
 *   node_id, file_type, phase, category, question_text, target_axis, lr_yes, lr_no
 *
 * CSVヘッダー（省略可能）:
 *   kappa, prescription_tags, contraindication_tags,
 *   time_decay_lambda, base_prevalence, information_gain,
 *   sort_order, mutual_exclusive_group, routing_rules
 * ============================================================
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export const VALID_FILE_TYPES = [
  "F1", "F2", "F3", "F4", "F5", "P0", "A3", "A5",
] as const;
export type FileType = (typeof VALID_FILE_TYPES)[number];

export interface ParsedNode {
  node_id: string;
  file_type: string;
  phase: string;
  category: string;
  question_text: string;
  target_axis: string;
  lr_yes: number;
  lr_no: number;
  kappa: number;
  prescription_tags: string[];
  contraindication_tags: string[];
  time_decay_lambda: number;
  base_prevalence: number;
  information_gain: number | null;
  sort_order: number;
  mutual_exclusive_group: string | null;
  routing_rules: Record<string, unknown> | null;
}

export interface ParseRowError {
  rowNumber: number;
  nodeId?: string;
  message: string;
}

export interface CsvParseResult {
  nodes: ParsedNode[];
  errors: ParseRowError[];
  totalRows: number;
}

// ---------------------------------------------------------------------------
// CSV 行パーサー（RFC4180 準拠・BOM 除去）
// ---------------------------------------------------------------------------

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// タグ文字列のパース（JSON 配列 OR カンマ区切り）
// ---------------------------------------------------------------------------

function parseTags(raw: string): string[] {
  if (!raw.trim()) return [];
  // JSON 配列として試みる
  if (raw.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((t) => typeof t === "string") as string[];
      }
    } catch {
      // fall through
    }
  }
  // カンマ区切りとして処理
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

// ---------------------------------------------------------------------------
// ルーティングルールのパース（JSON or 空）
// ---------------------------------------------------------------------------

function parseRoutingRules(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // 不正 JSON は null として扱う（警告はエラー配列に追加しない — オプションフィールドのため）
  }
  return null;
}

// ---------------------------------------------------------------------------
// メインパーサー
// ---------------------------------------------------------------------------

/**
 * CSV テキストを解析し ParsedNode[] と ParseRowError[] を返す。
 * DB への書き込みは行わない（preview + validation 専用）。
 */
export function parseAssessmentNodesCsv(csvText: string): CsvParseResult {
  // BOM 除去
  const text = csvText.replace(/^\uFEFF/, "");

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      nodes: [],
      errors: [{ rowNumber: 0, message: "CSVにデータ行がありません。ヘッダー行を含めてください。" }],
      totalRows: 0,
    };
  }

  // ヘッダー行解析（小文字 + trim して正規化）
  const headers = parseCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());

  const requiredHeaders = [
    "node_id", "file_type", "phase", "category",
    "question_text", "target_axis", "lr_yes", "lr_no",
  ];
  const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return {
      nodes: [],
      errors: [{
        rowNumber: 0,
        message: `必須ヘッダーが不足しています: ${missingHeaders.join(", ")}`,
      }],
      totalRows: 0,
    };
  }

  const idx = (name: string) => headers.indexOf(name);

  const dataLines = lines.slice(1);
  const nodes: ParsedNode[] = [];
  const errors: ParseRowError[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const rowNum = i + 2; // 1-indexed + header offset
    const cols = parseCsvLine(dataLines[i]!);
    const get = (name: string) => cols[idx(name)]?.trim() ?? "";

    // ── 必須フィールド ──
    const node_id = get("node_id");
    if (!node_id) {
      errors.push({ rowNumber: rowNum, message: "node_id が空です。" });
      continue;
    }

    const file_type = get("file_type").toUpperCase();
    if (!VALID_FILE_TYPES.includes(file_type as FileType)) {
      errors.push({
        rowNumber: rowNum,
        nodeId: node_id,
        message: `file_type「${file_type}」は不正です。有効値: ${VALID_FILE_TYPES.join(", ")}`,
      });
      continue;
    }

    const phase = get("phase");
    if (!phase) {
      errors.push({ rowNumber: rowNum, nodeId: node_id, message: "phase が空です。" });
      continue;
    }

    const category = get("category");
    if (!category) {
      errors.push({ rowNumber: rowNum, nodeId: node_id, message: "category が空です。" });
      continue;
    }

    const question_text = get("question_text");
    if (!question_text) {
      errors.push({ rowNumber: rowNum, nodeId: node_id, message: "question_text が空です。" });
      continue;
    }

    const target_axis = get("target_axis");
    if (!target_axis) {
      errors.push({ rowNumber: rowNum, nodeId: node_id, message: "target_axis が空です。" });
      continue;
    }

    const lrYesRaw = get("lr_yes");
    const lr_yes = parseFloat(lrYesRaw);
    if (isNaN(lr_yes) || lr_yes <= 0) {
      errors.push({
        rowNumber: rowNum,
        nodeId: node_id,
        message: `lr_yes「${lrYesRaw}」は正の数値でなければなりません。`,
      });
      continue;
    }

    const lrNoRaw = get("lr_no");
    const lr_no = parseFloat(lrNoRaw);
    if (isNaN(lr_no) || lr_no <= 0) {
      errors.push({
        rowNumber: rowNum,
        nodeId: node_id,
        message: `lr_no「${lrNoRaw}」は正の数値でなければなりません。`,
      });
      continue;
    }

    // ── オプションフィールド ──
    const kappaRaw = get("kappa");
    const kappa = kappaRaw ? parseFloat(kappaRaw) : 0.8;
    if (kappaRaw && (isNaN(kappa) || kappa < 0 || kappa > 1)) {
      errors.push({
        rowNumber: rowNum,
        nodeId: node_id,
        message: `kappa「${kappaRaw}」は 0〜1 の数値でなければなりません。`,
      });
      continue;
    }

    const lambdaRaw = get("time_decay_lambda");
    const time_decay_lambda = lambdaRaw ? parseFloat(lambdaRaw) : 0.02;

    const prevRaw = get("base_prevalence");
    const base_prevalence = prevRaw ? parseFloat(prevRaw) : 0.1;

    const igRaw = get("information_gain");
    const information_gain = igRaw ? parseFloat(igRaw) : null;

    const sortRaw = get("sort_order");
    const sort_order = sortRaw ? parseInt(sortRaw, 10) : i + 1;

    nodes.push({
      node_id,
      file_type,
      phase,
      category,
      question_text,
      target_axis,
      lr_yes,
      lr_no,
      kappa,
      prescription_tags: parseTags(get("prescription_tags")),
      contraindication_tags: parseTags(get("contraindication_tags")),
      time_decay_lambda,
      base_prevalence,
      information_gain: information_gain && !isNaN(information_gain) ? information_gain : null,
      sort_order: isNaN(sort_order) ? i + 1 : sort_order,
      mutual_exclusive_group: get("mutual_exclusive_group") || null,
      routing_rules: parseRoutingRules(get("routing_rules")),
    });
  }

  return { nodes, errors, totalRows: dataLines.length };
}
