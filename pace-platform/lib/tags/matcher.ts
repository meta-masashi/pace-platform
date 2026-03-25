/**
 * PACE Platform — タグマッチングユーティリティ
 *
 * エクササイズと禁忌タグ・処方タグのマッチング判定を行う。
 *
 * マッチングロジック:
 *   - 禁忌タグ（!#Category）: エクササイズの category / contraindication_tags_json / target_axis に対してマッチ
 *   - 処方タグ（#Category_Exercise）: エクササイズの prescription_tags_json / category / name パターンに対してマッチ
 *   - 階層マッチング対応: "!#ImpactLoad" は ImpactLoad タグを持つ全エクササイズをブロック
 */

import type { Exercise, ContraindicationTag, PrescriptionTag } from "./types";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 禁忌タグのプレフィックス */
const CONTRAINDICATION_PREFIX = "!#";

/** 処方タグのプレフィックス */
const PRESCRIPTION_PREFIX = "#";

// ---------------------------------------------------------------------------
// パブリック API
// ---------------------------------------------------------------------------

/**
 * エクササイズが禁忌タグにマッチするかを判定する。
 *
 * マッチ条件（いずれか1つ以上で true）:
 *   1. exercise.category が禁忌カテゴリに一致（大文字小文字無視）
 *   2. exercise.contraindication_tags_json に禁忌タグが含まれる
 *   3. exercise.targetAxis が禁忌カテゴリに一致（大文字小文字無視）
 *   4. exercise.prescriptionTagsJson のいずれかが禁忌カテゴリを含む（階層マッチ）
 *
 * @param exercise 判定対象のエクササイズ
 * @param contraindicationTag 禁忌タグ（例: "!#Sprinting"）
 * @returns マッチする場合 true
 */
export function matchesContraindication(
  exercise: Exercise,
  contraindicationTag: ContraindicationTag
): boolean {
  const category = parseContraindicationCategory(contraindicationTag);
  if (!category) return false;

  const categoryLower = category.toLowerCase();

  // 1. exercise.category の直接一致
  if (exercise.category.toLowerCase() === categoryLower) {
    return true;
  }

  // 2. exercise.contraindication_tags_json に含まれるか
  if (exercise.contraindicationTagsJson) {
    for (const tag of exercise.contraindicationTagsJson) {
      const parsed = parseContraindicationCategory(tag) ?? tag.replace(/^!?#?/, "");
      if (parsed.toLowerCase() === categoryLower) {
        return true;
      }
    }
  }

  // 3. exercise.targetAxis の一致
  if (exercise.targetAxis.toLowerCase() === categoryLower) {
    return true;
  }

  // 4. 階層マッチ: exercise.prescriptionTagsJson 内のカテゴリ部分
  if (exercise.prescriptionTagsJson) {
    for (const tag of exercise.prescriptionTagsJson) {
      const parts = parsePrescriptionParts(tag);
      if (parts && parts.some((p) => p.toLowerCase() === categoryLower)) {
        return true;
      }
    }
  }

  // 5. exercise.name_en の部分一致（例: "Sprint" を含むエクササイズ名）
  if (exercise.name_en.toLowerCase().includes(categoryLower)) {
    return true;
  }

  return false;
}

/**
 * エクササイズが処方タグにマッチするかを判定する。
 *
 * マッチ条件（いずれか1つ以上で true）:
 *   1. exercise.prescription_tags_json にタグが直接含まれる
 *   2. exercise.category + targetAxis がタグのパーツに一致
 *   3. exercise.name_en がタグ名パターンに一致
 *
 * @param exercise 判定対象のエクササイズ
 * @param prescriptionTag 処方タグ（例: "#Str_Hamstring_Eccentric"）
 * @returns マッチする場合 true
 */
export function matchesPrescription(
  exercise: Exercise,
  prescriptionTag: PrescriptionTag
): boolean {
  const tagBody = prescriptionTag.replace(/^#/, "");
  if (!tagBody) return false;

  const tagBodyLower = tagBody.toLowerCase();

  // 1. exercise.prescriptionTagsJson に直接含まれるか
  if (exercise.prescriptionTagsJson) {
    for (const tag of exercise.prescriptionTagsJson) {
      const body = tag.replace(/^#/, "");
      if (body.toLowerCase() === tagBodyLower) {
        return true;
      }
    }
  }

  // 2. タグのパーツ分解によるカテゴリ + 軸マッチ
  const tagParts = tagBody.split("_").map((p) => p.toLowerCase());
  if (tagParts.length >= 2) {
    const exerciseCategoryLower = exercise.category.toLowerCase();
    const exerciseAxisLower = exercise.targetAxis.toLowerCase();

    // パーツの少なくとも1つがカテゴリに一致し、かつ別のパーツが軸に一致
    const categoryMatch = tagParts.some((p) => exerciseCategoryLower.includes(p));
    const axisMatch = tagParts.some((p) => exerciseAxisLower.includes(p));
    if (categoryMatch && axisMatch) {
      return true;
    }
  }

  // 3. exercise.name_en のパターンマッチ（タグ全体の一致）
  const nameEnLower = exercise.name_en.toLowerCase().replace(/[\s-]/g, "_");
  if (nameEnLower.includes(tagBodyLower) || tagBodyLower.includes(nameEnLower)) {
    return true;
  }

  return false;
}

/**
 * 指定タグにマッチする全エクササイズを検索する。
 *
 * タグが "!#" プレフィックスで始まる場合は禁忌マッチ、
 * "#" プレフィックスで始まる場合は処方マッチを使用する。
 *
 * @param tag 検索タグ（処方または禁忌）
 * @param exercises 検索対象のエクササイズ一覧
 * @returns マッチしたエクササイズの配列
 */
export function findExercisesByTag(
  tag: string,
  exercises: Exercise[]
): Exercise[] {
  if (tag.startsWith(CONTRAINDICATION_PREFIX)) {
    return exercises.filter((ex) => matchesContraindication(ex, tag));
  }
  if (tag.startsWith(PRESCRIPTION_PREFIX)) {
    return exercises.filter((ex) => matchesPrescription(ex, tag));
  }
  return [];
}

// ---------------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------------

/**
 * 禁忌タグからカテゴリ名を抽出する。
 * "!#Sprinting" → "Sprinting"
 * "!#ImpactLoad" → "ImpactLoad"
 */
function parseContraindicationCategory(tag: string): string | null {
  if (!tag.startsWith(CONTRAINDICATION_PREFIX)) {
    // "!#" なしでも "#" 付きの場合はカテゴリとして扱う
    if (tag.startsWith("#")) return tag.slice(1) || null;
    return tag || null;
  }
  const category = tag.slice(CONTRAINDICATION_PREFIX.length);
  return category || null;
}

/**
 * 処方タグをアンダースコアで分割してパーツ配列を返す。
 * "#Str_Hamstring_Eccentric" → ["Str", "Hamstring", "Eccentric"]
 */
function parsePrescriptionParts(tag: string): string[] | null {
  const body = tag.replace(/^#/, "");
  if (!body) return null;
  return body.split("_");
}
