/**
 * PACE Platform — タグコンパイラ 型定義
 *
 * アセスメント結果（FiredNode）から禁忌タグ・処方タグを収集し、
 * ワークアウトメニューの自律的修正を行うシステムの型定義。
 *
 * タグ形式:
 *   - 処方タグ（PrescriptionTag）: "#Category_Exercise" 例: "#Str_Hamstring_Eccentric"
 *   - 禁忌タグ（ContraindicationTag）: "!#Category" 例: "!#Sprinting", "!#ImpactLoad"
 */

// ---------------------------------------------------------------------------
// タグ型
// ---------------------------------------------------------------------------

/**
 * 処方タグ — アセスメントノードが陽性の場合に推奨される運動タイプ。
 * フォーマット: "#Category_Exercise"
 * 例: "#Str_Hamstring_Eccentric", "#NM_NordicHamstring", "#Mob_HipFlexor"
 */
export type PrescriptionTag = string;

/**
 * 禁忌タグ — アセスメントノードが陽性の場合に禁止される運動タイプ。
 * フォーマット: "!#Category"
 * 例: "!#Sprinting", "!#ImpactLoad", "!#MaxEffort"
 */
export type ContraindicationTag = string;

// ---------------------------------------------------------------------------
// 発火ノード（アセスメント結果からの入力）
// ---------------------------------------------------------------------------

/**
 * アセスメントで陽性（answer="yes"）となったノードの情報。
 * ベイズ推論の結果から抽出され、タグコンパイラへの入力となる。
 */
export interface FiredNode {
  /** ノードID */
  nodeId: string;
  /** ノード名（表示用） */
  nodeName: string;
  /** 回答値（陽性ノードのみ使用） */
  answer: "yes" | "no" | "unknown";
  /** 対象の診断軸（例: "hamstring_strain", "ACL_tear"） */
  targetAxis: string;
  /** 事後確率（0-1） */
  posteriorProbability: number;
  /** 事前確率（0-1）— リスク倍率計算用 */
  priorProbability: number;
  /** カテゴリ（例: "knee", "hamstring"） */
  category: string;
  /** このノードの処方タグ一覧 */
  prescriptionTags: PrescriptionTag[];
  /** このノードの禁忌タグ一覧 */
  contraindicationTags: ContraindicationTag[];
  /** エビデンステキスト（学術参照）*/
  evidenceText: string;
  /** リスク増加率（%）— ベースラインからの増加 */
  riskIncrease: number;
}

// ---------------------------------------------------------------------------
// エクササイズ
// ---------------------------------------------------------------------------

/**
 * エクササイズマスタの1レコード。
 * exercises テーブルに対応する。
 */
export interface Exercise {
  /** エクササイズID */
  id: string;
  /** 日本語名 */
  name_ja: string;
  /** 英語名 */
  name_en: string;
  /** カテゴリ（例: "sprint", "strength", "mobility"） */
  category: string;
  /** 対象軸（例: "hamstring", "quadriceps"） */
  targetAxis: string;
  /** このエクササイズに紐づく処方タグ */
  prescriptionTagsJson: string[] | null;
  /** このエクササイズに紐づく禁忌タグ */
  contraindicationTagsJson: string[] | null;
  /** セット数 */
  sets: number;
  /** レップ数 */
  reps: number;
  /** RPE（自覚的運動強度） */
  rpe: number;
}

// ---------------------------------------------------------------------------
// コンパイル結果
// ---------------------------------------------------------------------------

/**
 * タグマッチングでメニューに挿入されたエクササイズの情報。
 */
export interface ExerciseMatch {
  /** エクササイズID */
  exerciseId: string;
  /** 日本語名 */
  name_ja: string;
  /** 英語名 */
  name_en: string;
  /** カテゴリ */
  category: string;
  /** マッチしたタグ */
  matchedTag: PrescriptionTag;
  /** 推奨セット数 */
  sets: number;
  /** 推奨レップ数 */
  reps: number;
  /** 推奨RPE */
  rpe: number;
}

/**
 * メニュー修正の1エントリ（エビデンストレイル）。
 */
export interface ModificationEntry {
  /** 発火ノードID */
  nodeId: string;
  /** 発火ノード名 */
  nodeName: string;
  /** マッチしたタグ */
  tag: PrescriptionTag | ContraindicationTag;
  /** アクション種別 */
  action: "blocked" | "inserted";
  /** 対象エクササイズ名（日本語） */
  exerciseName: string;
  /** エビデンステキスト */
  evidenceText: string;
}

/**
 * タグコンパイラの完全な出力結果。
 */
export interface TagCompilationResult {
  /** ブロック（除外）されたエクササイズ一覧 */
  blockedExercises: Exercise[];
  /** 挿入されたエクササイズ一覧 */
  insertedExercises: ExerciseMatch[];
  /** 発火した禁忌タグ一覧 */
  blockedTags: ContraindicationTag[];
  /** 発火した処方タグ一覧 */
  prescribedTags: PrescriptionTag[];
  /** コンフリクト情報（処方と禁忌が衝突したケース） */
  conflicts: ConflictEntry[];
  /** エビデンストレイル（全修正の履歴） */
  evidenceTrail: ModificationEntry[];
}

/**
 * 処方タグと禁忌タグの衝突情報。
 * 禁忌タグが絶対優先で処方タグを上書きする。
 */
export interface ConflictEntry {
  /** 衝突した処方タグ */
  prescriptionTag: PrescriptionTag;
  /** 衝突した禁忌タグ */
  contraindicationTag: ContraindicationTag;
  /** ブロックされたエクササイズ名 */
  blockedExerciseName: string;
  /** 処方元ノードID */
  prescriptionNodeId: string;
  /** 禁忌元ノードID */
  contraindicationNodeId: string;
}

// ---------------------------------------------------------------------------
// メニュードラフト
// ---------------------------------------------------------------------------

/**
 * 修正後のメニュードラフト。
 * スタッフ承認待ちの状態を表す。
 */
export interface MenuDraft {
  /** アスリートID */
  athleteId: string;
  /** 日付（YYYY-MM-DD） */
  date: string;
  /** 修正後のエクササイズ一覧 */
  exercises: Exercise[];
  /** メニューが修正されたかどうか */
  isModified: boolean;
  /** 修正の詳細 */
  modifications: ModificationEntry[];
}

// ---------------------------------------------------------------------------
// コンパイラ入力パラメータ
// ---------------------------------------------------------------------------

/**
 * compileMenu 関数の入力パラメータ。
 */
export interface CompileMenuParams {
  /** 現在のワークアウトメニュー */
  currentMenu: Exercise[];
  /** アセスメントで発火したノード一覧 */
  firedNodes: FiredNode[];
  /** エクササイズマスタ（処方挿入用の検索対象） */
  allExercises: Exercise[];
  /** リスク閾値（%）— この値以上のリスク増加があるノードのみタグを適用（デフォルト: 15） */
  riskThreshold?: number;
}
