/**
 * PACE Platform -- サンプル CSV 生成スクリプト
 *
 * assessment_nodes と exercises のサンプル CSV ファイルを生成する。
 * ヘッダーは DB スキーマと完全に一致する。
 *
 * Usage:
 *   npx tsx scripts/generate-sample-csv.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// サンプル assessment_nodes データ
// ---------------------------------------------------------------------------

const NODES_HEADERS = [
  "node_id",
  "file_type",
  "phase",
  "category",
  "question_text",
  "target_axis",
  "lr_yes",
  "lr_no",
  "kappa",
  "routing_rules_json",
  "prescription_tags_json",
  "contraindication_tags_json",
  "time_decay_lambda",
  "base_prevalence",
  "mutual_exclusive_group",
];

const NODES_ROWS = [
  [
    "knee_acl_01",
    "decision",
    "acute",
    "knee",
    "膝関節の前方引き出しテストで陽性ですか？",
    "sagittal",
    "8.5",
    "0.2",
    "0.85",
    '{"yes":"knee_acl_02","no":"knee_mcl_01"}',
    '["acl_protocol","knee_stability"]',
    '["full_weight_bearing","deep_squat"]',
    "0.03",
    "0.15",
    "knee_ligament",
  ],
  [
    "knee_acl_02",
    "decision",
    "acute",
    "knee",
    "ラックマンテストで陽性ですか？",
    "sagittal",
    "10.2",
    "0.1",
    "0.90",
    '{"yes":"knee_acl_03","no":"knee_meniscus_01"}',
    '["acl_protocol"]',
    '["plyometric","cutting"]',
    "0.03",
    "0.15",
    "knee_ligament",
  ],
  [
    "shoulder_rot_01",
    "measurement",
    "subacute",
    "shoulder",
    "肩関節の外旋可動域を測定してください（度）",
    "transverse",
    "3.2",
    "0.5",
    "0.78",
    '{"next":"shoulder_rot_02"}',
    '["shoulder_mobility","rotator_cuff"]',
    '["overhead_throw"]',
    "0.05",
    "0.20",
    "",
  ],
  [
    "ankle_sprain_01",
    "decision",
    "acute",
    "ankle",
    "前距腓靭帯の圧痛がありますか？",
    "frontal",
    "5.8",
    "0.3",
    "0.82",
    '{"yes":"ankle_sprain_02","no":"ankle_fracture_01"}',
    '["ankle_sprain_protocol"]',
    '["running","jumping"]',
    "0.04",
    "0.30",
    "ankle_lateral",
  ],
  [
    "hip_flex_01",
    "measurement",
    "return_to_play",
    "hip",
    "トーマステストで股関節屈筋の短縮を確認してください",
    "sagittal",
    "2.5",
    "0.6",
    "0.75",
    '{"next":"hip_flex_02"}',
    '["hip_flexibility","psoas_release"]',
    "[]",
    "0.06",
    "0.25",
    "",
  ],
];

// ---------------------------------------------------------------------------
// サンプル exercises データ
// ---------------------------------------------------------------------------

const EXERCISES_HEADERS = [
  "id",
  "category",
  "phase",
  "name_en",
  "name_ja",
  "target_axis",
  "sets",
  "reps",
  "time_sec",
  "percent_1rm",
  "rpe",
  "cues",
  "progressions",
  "contraindication_tags_json",
];

const EXERCISES_ROWS = [
  [
    "",
    "knee",
    "acute",
    "Quad Setting",
    "クアドセッティング",
    "sagittal",
    "3",
    "10",
    "",
    "",
    "3",
    "膝裏でタオルを押しつぶすように力を入れる。5秒保持。",
    '["straight_leg_raise","mini_squat"]',
    '["full_weight_bearing"]',
  ],
  [
    "",
    "knee",
    "subacute",
    "Mini Squat",
    "ミニスクワット",
    "sagittal",
    "3",
    "15",
    "",
    "",
    "5",
    "膝がつま先を超えないよう注意。痛みのない範囲で。",
    '["half_squat","single_leg_squat"]',
    '["deep_squat","jumping"]',
  ],
  [
    "",
    "shoulder",
    "subacute",
    "External Rotation with Band",
    "チューブ外旋エクササイズ",
    "transverse",
    "3",
    "12",
    "",
    "",
    "4",
    "肘を体側に固定し、前腕を外側に回す。ゆっくり戻す。",
    '["er_with_dumbbell","er_90_90"]',
    '["overhead_throw","bench_press"]',
  ],
  [
    "",
    "ankle",
    "acute",
    "Ankle Alphabet",
    "足首アルファベット運動",
    "frontal",
    "2",
    "",
    "60",
    "",
    "2",
    "足首でアルファベットを描くように動かす。痛みのない範囲で。",
    '["ankle_circle","calf_raise"]',
    '["running","jumping"]',
  ],
  [
    "",
    "hip",
    "return_to_play",
    "Single Leg Romanian Deadlift",
    "片足ルーマニアンデッドリフト",
    "sagittal",
    "3",
    "8",
    "",
    "60",
    "7",
    "軸足の膝を軽く曲げ、体幹を一直線に保つ。",
    '["barbell_rdl","single_leg_hop"]',
    '["acute_hamstring","lumbar_disc"]',
  ],
];

// ---------------------------------------------------------------------------
// CSV 出力
// ---------------------------------------------------------------------------

function toCsvLine(values: string[]): string {
  return values
    .map((v) => {
      if (v.includes(",") || v.includes('"') || v.includes("\n")) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    })
    .join(",");
}

function writeCsvFile(
  filePath: string,
  headers: string[],
  rows: string[][],
): void {
  const lines = [toCsvLine(headers), ...rows.map(toCsvLine)];
  // UTF-8 BOM 付きで書き出し（Excel で日本語が正しく表示されるように）
  const bom = "\ufeff";
  fs.writeFileSync(filePath, bom + lines.join("\n"), "utf-8");
}

// ---------------------------------------------------------------------------
// メイン処理
// ---------------------------------------------------------------------------

function main(): void {
  const dataDir = path.resolve(process.cwd(), "data");

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const nodesPath = path.join(dataDir, "sample_assessment_nodes.csv");
  writeCsvFile(nodesPath, NODES_HEADERS, NODES_ROWS);
  console.log(`サンプル assessment_nodes CSV を生成しました: ${nodesPath}`);

  const exercisesPath = path.join(dataDir, "sample_exercises.csv");
  writeCsvFile(exercisesPath, EXERCISES_HEADERS, EXERCISES_ROWS);
  console.log(`サンプル exercises CSV を生成しました: ${exercisesPath}`);

  console.log("\n生成されたファイルでインポートをテストできます:");
  console.log(
    `  npx tsx scripts/import-nodes.ts --file data/sample_assessment_nodes.csv --dry-run`,
  );
  console.log(
    `  npx tsx scripts/import-exercises.ts --file data/sample_exercises.csv --dry-run`,
  );
}

main();
