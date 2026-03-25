/**
 * PACE Platform -- Assessment Nodes インポートスクリプト
 *
 * CSV または Excel ファイルから assessment_nodes テーブルへデータをインポートする。
 * Routing_v4.3 カラムを自動パースし、routing_rules_json に構造化データとして格納する。
 *
 * Usage:
 *   npx tsx scripts/import-nodes.ts --file data/assessment_nodes.csv
 *   npx tsx scripts/import-nodes.ts --file data/assessment_nodes.xlsx --dry-run
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
import { parseRoutingRule } from "../lib/routing/parser";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface AssessmentNode {
  node_id: string;
  file_type: string;
  phase: string;
  category: string;
  question_text: string;
  target_axis: string | null;
  lr_yes: number | null;
  lr_no: number | null;
  kappa: number | null;
  routing_rules_json: unknown | null;
  prescription_tags_json: unknown | null;
  contraindication_tags_json: unknown | null;
  time_decay_lambda: number | null;
  base_prevalence: number | null;
  mutual_exclusive_group: string | null;
  // PRD Phase 1 エビデンスカラム
  lr_yes_clinical: number | null;
  evidence_text: string | null;
  half_life_days: number | null;
  chronic_alpha_modifier: number | null;
  // Routing_v4.3 生テキスト
  routing_v43_raw: string | null;
}

interface ErrorRow {
  row_number: number;
  node_id: string;
  errors: string[];
  raw_data: Record<string, string>;
}

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = [
  "node_id",
  "file_type",
  "phase",
  "category",
  "question_text",
];

function validateRow(
  row: Record<string, string>,
  rowIndex: number,
): { data: AssessmentNode | null; errors: string[] } {
  const errors: string[] = [];

  // 必須フィールド
  errors.push(...validateRequired(row, REQUIRED_FIELDS));

  // 数値フィールド（LR 値は正の数）
  const lrYesErr = validateNumeric(row["lr_yes"] ?? "", "lr_yes", 0);
  if (lrYesErr) errors.push(lrYesErr);

  const lrNoErr = validateNumeric(row["lr_no"] ?? "", "lr_no", 0);
  if (lrNoErr) errors.push(lrNoErr);

  const kappaErr = validateNumeric(row["kappa"] ?? "", "kappa", 0, 1);
  if (kappaErr) errors.push(kappaErr);

  const tdlErr = validateNumeric(
    row["time_decay_lambda"] ?? "",
    "time_decay_lambda",
    0,
  );
  if (tdlErr) errors.push(tdlErr);

  const bpErr = validateNumeric(
    row["base_prevalence"] ?? "",
    "base_prevalence",
    0,
    1,
  );
  if (bpErr) errors.push(bpErr);

  // PRD Phase 1 エビデンスカラムのバリデーション
  const lrYesClinicalErr = validateNumeric(
    row["lr_yes_clinical"] ?? "",
    "lr_yes_clinical",
    0,
  );
  if (lrYesClinicalErr) errors.push(lrYesClinicalErr);

  const halfLifeErr = validateNumeric(
    row["half_life_days"] ?? "",
    "half_life_days",
    0,
  );
  if (halfLifeErr) errors.push(halfLifeErr);

  const chronicAlphaErr = validateNumeric(
    row["chronic_alpha_modifier"] ?? "",
    "chronic_alpha_modifier",
    0,
  );
  if (chronicAlphaErr) errors.push(chronicAlphaErr);

  // JSON フィールド
  const rrErr = validateJson(
    row["routing_rules_json"] ?? "",
    "routing_rules_json",
  );
  if (rrErr) errors.push(rrErr);

  const ptErr = validateJson(
    row["prescription_tags_json"] ?? "",
    "prescription_tags_json",
  );
  if (ptErr) errors.push(ptErr);

  const ctErr = validateJson(
    row["contraindication_tags_json"] ?? "",
    "contraindication_tags_json",
  );
  if (ctErr) errors.push(ctErr);

  if (errors.length > 0) {
    return { data: null, errors };
  }

  // Routing_v4.3 カラムのパース
  // CSV に Routing_v4.3 カラムがある場合、パースして routing_rules_json に格納する。
  // 既存の routing_rules_json カラムが空で Routing_v4.3 が存在する場合のみ上書き。
  const routingV43Raw = emptyToNull(row["Routing_v4.3"] ?? row["routing_v43"]);
  let routingRulesJson = parseNullableJson(row["routing_rules_json"]);

  if (routingV43Raw && !routingRulesJson) {
    // Routing_v4.3 テキストをパースして routing_rules_json に変換
    const parsedCondition = parseRoutingRule(routingV43Raw);
    routingRulesJson = {
      ...((routingRulesJson as Record<string, unknown>) ?? {}),
      routing_condition: parsedCondition,
    };
  }

  // データオブジェクト構築
  const data: AssessmentNode = {
    node_id: row["node_id"]!.trim(),
    file_type: row["file_type"]!.trim(),
    phase: row["phase"]!.trim(),
    category: row["category"]!.trim(),
    question_text: row["question_text"]!.trim(),
    target_axis: emptyToNull(row["target_axis"]),
    lr_yes: parseNullableNumber(row["lr_yes"]),
    lr_no: parseNullableNumber(row["lr_no"]),
    kappa: parseNullableNumber(row["kappa"]),
    routing_rules_json: routingRulesJson,
    prescription_tags_json: parseNullableJson(row["prescription_tags_json"]),
    contraindication_tags_json: parseNullableJson(
      row["contraindication_tags_json"],
    ),
    time_decay_lambda: parseNullableNumber(row["time_decay_lambda"]),
    base_prevalence: parseNullableNumber(row["base_prevalence"]),
    mutual_exclusive_group: emptyToNull(row["mutual_exclusive_group"]),
    // PRD Phase 1 エビデンスカラム
    lr_yes_clinical: parseNullableNumber(row["lr_yes_clinical"]),
    evidence_text: emptyToNull(row["evidence_text"]),
    half_life_days: parseNullableNumber(row["half_life_days"]),
    chronic_alpha_modifier: parseNullableNumber(row["chronic_alpha_modifier"]),
    // Routing_v4.3 生テキスト
    routing_v43_raw: routingV43Raw,
  };

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
    `errors_nodes_${timestamp}.csv`,
  );

  const headers = ["row_number", "node_id", "errors", "raw_data"];
  const lines = [headers.join(",")];

  for (const row of errorRows) {
    const fields = [
      String(row.row_number),
      `"${row.node_id.replace(/"/g, '""')}"`,
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
    console.error("Usage: npx tsx scripts/import-nodes.ts --file <path> [--dry-run]");
    process.exit(1);
  }

  const filePath = args[fileIndex + 1]!;

  console.log("=".repeat(60));
  console.log("PACE Platform -- Assessment Nodes インポート");
  console.log("=".repeat(60));
  console.log(`ファイル: ${filePath}`);
  console.log(`モード: ${dryRun ? "ドライラン（検証のみ）" : "本番インポート"}`);
  console.log("-".repeat(60));

  // ファイル読み込み
  let rows: Record<string, string>[];
  try {
    rows = await readFile(filePath);
  } catch (err) {
    console.error(`ファイル読み込みエラー: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  console.log(`読み込み行数: ${rows.length}`);

  // バリデーション
  const validRows: AssessmentNode[] = [];
  const errorRows: ErrorRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const { data, errors } = validateRow(row, i + 2); // +2 = ヘッダー行 + 0-indexed

    if (data) {
      validRows.push(data);
    } else {
      errorRows.push({
        row_number: i + 2,
        node_id: row["node_id"] ?? "(不明)",
        errors,
        raw_data: row,
      });
      console.error(
        `  [エラー] 行 ${i + 2} (node_id: ${row["node_id"] ?? "不明"}): ${errors.join(", ")}`,
      );
    }
  }

  console.log("-".repeat(60));
  console.log(`検証結果: 有効 ${validRows.length} 行 / エラー ${errorRows.length} 行`);

  // エラーファイル出力
  if (errorRows.length > 0) {
    const errorFile = writeErrorFile(errorRows);
    console.log(`エラー詳細: ${errorFile}`);
  }

  // ドライラン時はここで終了
  if (dryRun) {
    console.log("\nドライラン完了。データベースへの書き込みは行われていません。");
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

  // バッチサイズ 50 で upsert
  const BATCH_SIZE = 50;

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from("assessment_nodes")
      .upsert(batch, { onConflict: "node_id" });

    if (error) {
      console.error(
        `  [DB エラー] バッチ ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`,
      );
      dbErrorCount += batch.length;
    } else {
      successCount += batch.length;
      process.stdout.write(
        `\r  インポート中: ${successCount} / ${validRows.length} 行`,
      );
    }
  }

  console.log("\n" + "=".repeat(60));
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
