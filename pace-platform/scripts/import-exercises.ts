/**
 * PACE Platform -- Exercises インポートスクリプト
 *
 * CSV または Excel ファイルから exercises テーブルへデータをインポートする。
 *
 * Usage:
 *   npx tsx scripts/import-exercises.ts --file data/exercises.csv
 *   npx tsx scripts/import-exercises.ts --file data/exercises.xlsx --dry-run
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { readFile } from "./lib/csv-reader";
import {
  validateRequired,
  validateNumeric,
  validateJson,
} from "./lib/validator";
import { getSupabaseAdmin } from "./lib/supabase-admin";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface Exercise {
  id?: string;
  category: string;
  phase: string;
  name_en: string | null;
  name_ja: string;
  target_axis: string | null;
  sets: number | null;
  reps: number | null;
  time_sec: number | null;
  percent_1rm: number | null;
  rpe: number | null;
  cues: string | null;
  progressions: unknown | null;
  contraindication_tags_json: unknown | null;
}

interface ErrorRow {
  row_number: number;
  name_ja: string;
  errors: string[];
  raw_data: Record<string, string>;
}

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = ["category", "phase", "name_ja"];

function validateRow(
  row: Record<string, string>,
  rowIndex: number,
): { data: Exercise | null; errors: string[] } {
  const errors: string[] = [];

  // 必須フィールド
  errors.push(...validateRequired(row, REQUIRED_FIELDS));

  // 数値フィールド（合理的な範囲チェック）
  const setsErr = validateNumeric(row["sets"] ?? "", "sets", 0, 100);
  if (setsErr) errors.push(setsErr);

  const repsErr = validateNumeric(row["reps"] ?? "", "reps", 0, 1000);
  if (repsErr) errors.push(repsErr);

  const timeErr = validateNumeric(row["time_sec"] ?? "", "time_sec", 0, 7200);
  if (timeErr) errors.push(timeErr);

  const pctErr = validateNumeric(
    row["percent_1rm"] ?? "",
    "percent_1rm",
    0,
    100,
  );
  if (pctErr) errors.push(pctErr);

  const rpeErr = validateNumeric(row["rpe"] ?? "", "rpe", 0, 10);
  if (rpeErr) errors.push(rpeErr);

  // JSON フィールド
  const progErr = validateJson(row["progressions"] ?? "", "progressions");
  if (progErr) errors.push(progErr);

  const ctErr = validateJson(
    row["contraindication_tags_json"] ?? "",
    "contraindication_tags_json",
  );
  if (ctErr) errors.push(ctErr);

  if (errors.length > 0) {
    return { data: null, errors };
  }

  // データオブジェクト構築
  const data: Exercise = {
    category: row["category"]!.trim(),
    phase: row["phase"]!.trim(),
    name_en: emptyToNull(row["name_en"]),
    name_ja: row["name_ja"]!.trim(),
    target_axis: emptyToNull(row["target_axis"]),
    sets: parseNullableNumber(row["sets"]),
    reps: parseNullableNumber(row["reps"]),
    time_sec: parseNullableNumber(row["time_sec"]),
    percent_1rm: parseNullableNumber(row["percent_1rm"]),
    rpe: parseNullableNumber(row["rpe"]),
    cues: emptyToNull(row["cues"]),
    progressions: parseNullableJson(row["progressions"]),
    contraindication_tags_json: parseNullableJson(
      row["contraindication_tags_json"],
    ),
  };

  // id が指定されていれば含める（upsert 用）
  const id = emptyToNull(row["id"]);
  if (id) {
    data.id = id;
  }

  return { data, errors: [] };
}

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

function emptyToNull(value: string | undefined): string | null {
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }
  return value.trim();
}

function parseNullableNumber(value: string | undefined): number | null {
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }
  const num = Number(value);
  return isNaN(num) ? null : num;
}

function parseNullableJson(value: string | undefined): unknown | null {
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// エラーファイル書き出し
// ---------------------------------------------------------------------------

function writeErrorFile(errorRows: ErrorRow[]): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const errorFilePath = path.resolve(
    process.cwd(),
    `errors_exercises_${timestamp}.csv`,
  );

  const headers = ["row_number", "name_ja", "errors", "raw_data"];
  const lines = [headers.join(",")];

  for (const row of errorRows) {
    const fields = [
      String(row.row_number),
      `"${row.name_ja.replace(/"/g, '""')}"`,
      `"${row.errors.join("; ").replace(/"/g, '""')}"`,
      `"${JSON.stringify(row.raw_data).replace(/"/g, '""')}"`,
    ];
    lines.push(fields.join(","));
  }

  fs.writeFileSync(errorFilePath, lines.join("\n"), "utf-8");
  return errorFilePath;
}

// ---------------------------------------------------------------------------
// メイン処理
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf("--file");
  const dryRun = args.includes("--dry-run");

  if (fileIndex === -1 || !args[fileIndex + 1]) {
    console.error(
      "Usage: npx tsx scripts/import-exercises.ts --file <path> [--dry-run]",
    );
    process.exit(1);
  }

  const filePath = args[fileIndex + 1]!;

  console.log("=".repeat(60));
  console.log("PACE Platform -- Exercises インポート");
  console.log("=".repeat(60));
  console.log(`ファイル: ${filePath}`);
  console.log(`モード: ${dryRun ? "ドライラン（検証のみ）" : "本番インポート"}`);
  console.log("-".repeat(60));

  // ファイル読み込み
  let rows: Record<string, string>[];
  try {
    rows = await readFile(filePath);
  } catch (err) {
    console.error(
      `ファイル読み込みエラー: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  console.log(`読み込み行数: ${rows.length}`);

  // バリデーション
  const validRows: Exercise[] = [];
  const errorRows: ErrorRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const { data, errors } = validateRow(row, i + 2);

    if (data) {
      validRows.push(data);
    } else {
      errorRows.push({
        row_number: i + 2,
        name_ja: row["name_ja"] ?? "(不明)",
        errors,
        raw_data: row,
      });
      console.error(
        `  [エラー] 行 ${i + 2} (name_ja: ${row["name_ja"] ?? "不明"}): ${errors.join(", ")}`,
      );
    }
  }

  console.log("-".repeat(60));
  console.log(
    `検証結果: 有効 ${validRows.length} 行 / エラー ${errorRows.length} 行`,
  );

  // エラーファイル出力
  if (errorRows.length > 0) {
    const errorFile = writeErrorFile(errorRows);
    console.log(`エラー詳細: ${errorFile}`);
  }

  // ドライラン時はここで終了
  if (dryRun) {
    console.log(
      "\nドライラン完了。データベースへの書き込みは行われていません。",
    );
    process.exit(errorRows.length > 0 ? 1 : 0);
  }

  // DB への upsert
  if (validRows.length === 0) {
    console.log("\nインポート対象の行がありません。");
    process.exit(1);
  }

  const supabase = getSupabaseAdmin();

  let successCount = 0;
  let dbErrorCount = 0;

  // id が指定されている行は upsert、ない行は insert
  const rowsWithId = validRows.filter((r) => r.id);
  const rowsWithoutId = validRows.filter((r) => !r.id);

  // id 付き: upsert（バッチサイズ 50）
  const BATCH_SIZE = 50;

  for (let i = 0; i < rowsWithId.length; i += BATCH_SIZE) {
    const batch = rowsWithId.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from("exercises")
      .upsert(batch, { onConflict: "id" });

    if (error) {
      console.error(
        `  [DB エラー] upsert バッチ ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`,
      );
      dbErrorCount += batch.length;
    } else {
      successCount += batch.length;
    }
  }

  // id なし: insert
  for (let i = 0; i < rowsWithoutId.length; i += BATCH_SIZE) {
    const batch = rowsWithoutId.slice(i, i + BATCH_SIZE);

    const { error } = await supabase.from("exercises").insert(batch);

    if (error) {
      console.error(
        `  [DB エラー] insert バッチ ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`,
      );
      dbErrorCount += batch.length;
    } else {
      successCount += batch.length;
    }
  }

  process.stdout.write(
    `\r  インポート完了: ${successCount} / ${validRows.length} 行\n`,
  );

  console.log("=".repeat(60));
  console.log("インポート完了");
  console.log(`  成功: ${successCount} 行`);
  console.log(`  検証エラー: ${errorRows.length} 行`);
  console.log(`  DB エラー: ${dbErrorCount} 行`);
  console.log("=".repeat(60));

  process.exit(dbErrorCount > 0 || errorRows.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("予期しないエラーが発生しました:", err);
  process.exit(1);
});
