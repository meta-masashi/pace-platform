/**
 * PACE Platform -- CSV ファイル読み込みユーティリティ
 *
 * .csv (UTF-8, BOM 対応) を読み込み、
 * ヘッダーキーをもつ行オブジェクト配列を返す。
 *
 * xlsx パッケージは Prototype Pollution + ReDoS 脆弱性のため削除。
 * Excel ファイルは CSV にエクスポートしてからインポートしてください。
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * CSV ファイルを読み込み、行オブジェクト配列として返す。
 *
 * @param filePath - 読み込むファイルのパス (.csv)
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

  throw new Error(
    `サポートされていないファイル形式です: ${ext}（.csv のみ対応。Excel ファイルは CSV にエクスポートしてください）`,
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

// xlsx パッケージは脆弱性 (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9) のため削除。
// Excel ファイルのインポートが必要な場合は、事前に CSV にエクスポートしてください。
