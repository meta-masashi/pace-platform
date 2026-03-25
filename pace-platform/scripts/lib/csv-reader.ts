/**
 * PACE Platform -- CSV / Excel ファイル読み込みユーティリティ
 *
 * .csv (UTF-8, BOM 対応) および .xlsx ファイルを読み込み、
 * ヘッダーキーをもつ行オブジェクト配列を返す。
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * CSV または Excel ファイルを読み込み、行オブジェクト配列として返す。
 *
 * @param filePath - 読み込むファイルのパス (.csv / .xlsx)
 * @returns ヘッダーをキーとする行オブジェクトの配列
 */
export async function readFile(
  filePath: string,
): Promise<Record<string, string>[]> {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`ファイルが見つかりません: ${resolved}`);
  }

  const ext = path.extname(resolved).toLowerCase();

  if (ext === ".csv") {
    return readCsv(resolved);
  }

  if (ext === ".xlsx" || ext === ".xls") {
    return readExcel(resolved);
  }

  throw new Error(
    `サポートされていないファイル形式です: ${ext} (.csv / .xlsx のみ対応)`,
  );
}

// ---------------------------------------------------------------------------
// CSV 読み込み
// ---------------------------------------------------------------------------

function readCsv(filePath: string): Record<string, string>[] {
  let content = fs.readFileSync(filePath, "utf-8");

  // BOM 除去
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");

  if (lines.length < 2) {
    throw new Error("CSV ファイルにヘッダーとデータ行が必要です");
  }

  const headers = parseCsvLine(lines[0]!);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]!);
    const row: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (header !== undefined) {
        row[header] = values[j] ?? "";
      }
    }

    rows.push(row);
  }

  return rows;
}

/**
 * RFC 4180 準拠の CSV 行パーサ。
 * ダブルクォートで囲まれたフィールド内のカンマ・改行に対応。
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i]!;

    if (inQuotes) {
      if (char === '"') {
        // エスケープされたダブルクォート
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // クォート終了
        inQuotes = false;
        i++;
        continue;
      }
      current += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (char === ",") {
      result.push(current.trim());
      current = "";
      i++;
      continue;
    }

    current += char;
    i++;
  }

  result.push(current.trim());
  return result;
}

// ---------------------------------------------------------------------------
// Excel 読み込み
// ---------------------------------------------------------------------------

async function readExcel(filePath: string): Promise<Record<string, string>[]> {
  // xlsx は動的インポート（devDependency のため）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX = (await import("xlsx")) as any;

  const workbook = XLSX.readFile(filePath, { type: "file", codepage: 65001 });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("Excel ファイルにシートが見つかりません");
  }

  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`シート "${sheetName}" の読み込みに失敗しました`);
  }

  const jsonData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  });

  // すべての値を文字列に変換
  return jsonData.map((row: Record<string, unknown>) => {
    const stringRow: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      stringRow[key] = value === null || value === undefined ? "" : String(value);
    }
    return stringRow;
  });
}
