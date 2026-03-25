/**
 * PACE Platform — タグコンパイラ（メニュー自律修正エンジン）
 *
 * アセスメント結果（FiredNode 一覧）から禁忌タグ・処方タグを収集し、
 * 現在のワークアウトメニューを決定論的に修正する。
 *
 * 絶対優先ルール（Absolute Priority Rule）:
 *   禁忌タグ（!# プレフィックス）は最高優先度を持つ。
 *   他のノードが同じエクササイズを処方していても、禁忌が1つでもあればブロックする。
 *
 * このモジュールは純粋に決定論的であり、ML やランダム要素を一切含まない。
 */

import type {
  CompileMenuParams,
  TagCompilationResult,
  ContraindicationTag,
  PrescriptionTag,
  Exercise,
  ExerciseMatch,
  ModificationEntry,
  ConflictEntry,
  FiredNode,
} from "./types";
import { matchesContraindication, matchesPrescription, findExercisesByTag } from "./matcher";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** デフォルトのリスク閾値（%）— この値以上のリスク増加があるノードのみタグを適用 */
const DEFAULT_RISK_THRESHOLD = 15;

// ---------------------------------------------------------------------------
// パブリック API
// ---------------------------------------------------------------------------

/**
 * タグコンパイラ — ワークアウトメニューの自律修正。
 *
 * アルゴリズム:
 *   1. 発火ノードから禁忌タグ・処方タグを収集（リスク閾値フィルタ適用）
 *   2. 禁忌タグによるエクササイズブロック（絶対優先）
 *   3. 処方タグによるエクササイズ挿入（禁忌チェック付き）
 *   4. コンフリクト検出・エビデンストレイル構築
 *
 * @param params コンパイルパラメータ
 * @returns コンパイル結果（ブロック・挿入・コンフリクト・エビデンストレイル）
 */
export function compileMenu(params: CompileMenuParams): TagCompilationResult {
  const {
    currentMenu,
    firedNodes,
    allExercises,
    riskThreshold = DEFAULT_RISK_THRESHOLD,
  } = params;

  // --- Step 1: 発火ノードからタグを収集 ---
  const activeContraindications = collectContraindicationTags(firedNodes, riskThreshold);
  const activePrescriptions = collectPrescriptionTags(firedNodes, riskThreshold);

  // --- Step 2: 禁忌タグによるエクササイズブロック（絶対優先） ---
  const blockResult = blockExercises(currentMenu, activeContraindications, firedNodes);

  // --- Step 3: 処方タグによるエクササイズ挿入 ---
  const insertResult = insertExercises(
    allExercises,
    activePrescriptions,
    activeContraindications,
    blockResult.remainingMenu,
    firedNodes
  );

  // --- Step 4: コンフリクト検出 ---
  const conflicts = detectConflicts(
    activePrescriptions,
    activeContraindications,
    allExercises,
    firedNodes
  );

  // --- エビデンストレイル統合 ---
  const evidenceTrail: ModificationEntry[] = [
    ...blockResult.evidenceTrail,
    ...insertResult.evidenceTrail,
  ];

  return {
    blockedExercises: blockResult.blockedExercises,
    insertedExercises: insertResult.insertedExercises,
    blockedTags: [...new Set(activeContraindications.map((c) => c.tag))],
    prescribedTags: [...new Set(activePrescriptions.map((p) => p.tag))],
    conflicts,
    evidenceTrail,
  };
}

// ---------------------------------------------------------------------------
// Step 1: タグ収集
// ---------------------------------------------------------------------------

interface CollectedTag<T> {
  tag: T;
  nodeId: string;
  nodeName: string;
  evidenceText: string;
}

/**
 * 発火ノードから禁忌タグを収集する。
 * answer="yes" かつリスク増加が閾値以上のノードのみ対象。
 */
function collectContraindicationTags(
  firedNodes: FiredNode[],
  riskThreshold: number
): CollectedTag<ContraindicationTag>[] {
  const result: CollectedTag<ContraindicationTag>[] = [];

  for (const node of firedNodes) {
    if (node.answer !== "yes") continue;
    if (node.riskIncrease < riskThreshold) continue;

    for (const tag of node.contraindicationTags) {
      result.push({
        tag,
        nodeId: node.nodeId,
        nodeName: node.nodeName,
        evidenceText: node.evidenceText,
      });
    }
  }

  return result;
}

/**
 * 発火ノードから処方タグを収集する。
 * answer="yes" かつリスク増加が閾値以上のノードのみ対象。
 */
function collectPrescriptionTags(
  firedNodes: FiredNode[],
  riskThreshold: number
): CollectedTag<PrescriptionTag>[] {
  const result: CollectedTag<PrescriptionTag>[] = [];

  for (const node of firedNodes) {
    if (node.answer !== "yes") continue;
    if (node.riskIncrease < riskThreshold) continue;

    for (const tag of node.prescriptionTags) {
      result.push({
        tag,
        nodeId: node.nodeId,
        nodeName: node.nodeName,
        evidenceText: node.evidenceText,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 2: 禁忌によるブロック
// ---------------------------------------------------------------------------

interface BlockResult {
  blockedExercises: Exercise[];
  remainingMenu: Exercise[];
  evidenceTrail: ModificationEntry[];
}

/**
 * 禁忌タグにマッチするエクササイズをメニューからブロック（除外）する。
 */
function blockExercises(
  currentMenu: Exercise[],
  contraindications: CollectedTag<ContraindicationTag>[],
  _firedNodes: FiredNode[]
): BlockResult {
  const blockedExercises: Exercise[] = [];
  const evidenceTrail: ModificationEntry[] = [];
  /** ブロック済みエクササイズID（重複防止） */
  const blockedIds = new Set<string>();

  for (const ci of contraindications) {
    for (const exercise of currentMenu) {
      if (blockedIds.has(exercise.id)) continue;

      if (matchesContraindication(exercise, ci.tag)) {
        blockedIds.add(exercise.id);
        blockedExercises.push(exercise);

        evidenceTrail.push({
          nodeId: ci.nodeId,
          nodeName: ci.nodeName,
          tag: ci.tag,
          action: "blocked",
          exerciseName: exercise.name_ja,
          evidenceText: ci.evidenceText,
        });
      }
    }
  }

  const remainingMenu = currentMenu.filter((ex) => !blockedIds.has(ex.id));

  return { blockedExercises, remainingMenu, evidenceTrail };
}

// ---------------------------------------------------------------------------
// Step 3: 処方による挿入
// ---------------------------------------------------------------------------

interface InsertResult {
  insertedExercises: ExerciseMatch[];
  evidenceTrail: ModificationEntry[];
}

/**
 * 処方タグにマッチするエクササイズを挿入する。
 * 禁忌タグにマッチするエクササイズは挿入しない（絶対優先ルール）。
 */
function insertExercises(
  allExercises: Exercise[],
  prescriptions: CollectedTag<PrescriptionTag>[],
  contraindications: CollectedTag<ContraindicationTag>[],
  remainingMenu: Exercise[],
  _firedNodes: FiredNode[]
): InsertResult {
  const insertedExercises: ExerciseMatch[] = [];
  const evidenceTrail: ModificationEntry[] = [];
  /** 挿入済みエクササイズID（重複防止） */
  const insertedIds = new Set<string>();
  /** 既存メニューのエクササイズID */
  const existingIds = new Set(remainingMenu.map((ex) => ex.id));

  for (const rx of prescriptions) {
    // 処方タグにマッチするエクササイズを検索
    const candidates = findExercisesByTag(rx.tag, allExercises);

    for (const candidate of candidates) {
      // 既に挿入済み or 既存メニューに含まれる場合はスキップ
      if (insertedIds.has(candidate.id) || existingIds.has(candidate.id)) {
        continue;
      }

      // 禁忌チェック: 挿入候補が禁忌タグにマッチしないことを確認
      const violatesContraindication = contraindications.some((ci) =>
        matchesContraindication(candidate, ci.tag)
      );

      if (violatesContraindication) {
        // コンフリクトとして記録（Step 4 で別途検出）
        continue;
      }

      insertedIds.add(candidate.id);

      insertedExercises.push({
        exerciseId: candidate.id,
        name_ja: candidate.name_ja,
        name_en: candidate.name_en,
        category: candidate.category,
        matchedTag: rx.tag,
        sets: candidate.sets,
        reps: candidate.reps,
        rpe: candidate.rpe,
      });

      evidenceTrail.push({
        nodeId: rx.nodeId,
        nodeName: rx.nodeName,
        tag: rx.tag,
        action: "inserted",
        exerciseName: candidate.name_ja,
        evidenceText: rx.evidenceText,
      });

      // 各処方タグにつき最初のマッチのみ挿入（メニュー肥大防止）
      break;
    }
  }

  return { insertedExercises, evidenceTrail };
}

// ---------------------------------------------------------------------------
// Step 4: コンフリクト検出
// ---------------------------------------------------------------------------

/**
 * 処方タグと禁忌タグのコンフリクトを検出する。
 * 処方が推奨するエクササイズが禁忌によりブロックされたケースを記録。
 */
function detectConflicts(
  prescriptions: CollectedTag<PrescriptionTag>[],
  contraindications: CollectedTag<ContraindicationTag>[],
  allExercises: Exercise[],
  _firedNodes: FiredNode[]
): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];
  /** 重複防止キー */
  const seen = new Set<string>();

  for (const rx of prescriptions) {
    const candidates = findExercisesByTag(rx.tag, allExercises);

    for (const candidate of candidates) {
      for (const ci of contraindications) {
        if (matchesContraindication(candidate, ci.tag)) {
          const key = `${rx.tag}|${ci.tag}|${candidate.id}`;
          if (seen.has(key)) continue;
          seen.add(key);

          conflicts.push({
            prescriptionTag: rx.tag,
            contraindicationTag: ci.tag,
            blockedExerciseName: candidate.name_ja,
            prescriptionNodeId: rx.nodeId,
            contraindicationNodeId: ci.nodeId,
          });
        }
      }
    }
  }

  return conflicts;
}
