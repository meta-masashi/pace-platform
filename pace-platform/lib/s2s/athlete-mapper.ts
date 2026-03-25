/**
 * PACE Platform — S2S アスリートマッピング
 *
 * 外部デバイスプロバイダーのアスリートIDを
 * 内部の athletes テーブルの UUID に紐づける。
 *
 * マッチング戦略:
 *   1. athlete_external_ids テーブルの直接マッピング（最優先）
 *   2. 選手名のファジーマッチング（フォールバック）
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { S2SAthleteData } from "./types";

// ---------------------------------------------------------------------------
// マッピング結果
// ---------------------------------------------------------------------------

/**
 * マッピング結果を Map<externalId, internalAthleteId> で返す。
 */
export interface MapResult {
  /** 紐づけ成功: externalId → internalId */
  mapped: Map<string, string>;
  /** 紐づけ失敗の外部IDリスト */
  unmapped: string[];
}

// ---------------------------------------------------------------------------
// メイン関数
// ---------------------------------------------------------------------------

/**
 * 外部アスリートIDを内部IDにマッピングする。
 *
 * @param supabase - Supabase クライアント
 * @param orgId - 組織ID
 * @param provider - デバイスプロバイダー名
 * @param externalAthletes - 外部アスリートデータ配列
 * @returns マッピング結果
 */
export async function mapAthletes(
  supabase: SupabaseClient,
  orgId: string,
  provider: string,
  externalAthletes: S2SAthleteData[]
): Promise<MapResult> {
  const mapped = new Map<string, string>();
  const unmapped: string[] = [];

  if (externalAthletes.length === 0) {
    return { mapped, unmapped };
  }

  const externalIds = externalAthletes.map((a) => a.externalId);

  // ----- ステップ 1: 直接マッピング（athlete_external_ids テーブル） -----
  const { data: directMappings, error: directError } = await supabase
    .from("athlete_external_ids")
    .select("athlete_id, external_id")
    .eq("provider", provider)
    .in("external_id", externalIds);

  if (directError) {
    console.warn("[s2s:mapper] 直接マッピング取得エラー:", directError.message);
  }

  const directMap = new Map<string, string>();
  for (const mapping of directMappings ?? []) {
    directMap.set(
      mapping.external_id as string,
      mapping.athlete_id as string
    );
  }

  // マッピング結果を適用
  const remainingAthletes: S2SAthleteData[] = [];
  for (const athlete of externalAthletes) {
    const internalId = directMap.get(athlete.externalId);
    if (internalId) {
      mapped.set(athlete.externalId, internalId);
    } else {
      remainingAthletes.push(athlete);
    }
  }

  // ----- ステップ 2: 名前によるファジーマッチング（フォールバック） -----
  if (remainingAthletes.length > 0) {
    const athletesWithNames = remainingAthletes.filter((a) => a.name);

    if (athletesWithNames.length > 0) {
      // 同組織のアスリート名を取得
      const { data: orgAthletes, error: orgError } = await supabase
        .from("athletes")
        .select("id, name, name_kana")
        .eq("org_id", orgId);

      if (orgError) {
        console.warn("[s2s:mapper] 組織アスリート取得エラー:", orgError.message);
      }

      const internalAthletes = orgAthletes ?? [];

      for (const external of athletesWithNames) {
        const match = findBestNameMatch(external.name!, internalAthletes as Array<{
          id: string;
          name: string;
          name_kana: string | null;
        }>);
        if (match) {
          mapped.set(external.externalId, match);
        } else {
          unmapped.push(external.externalId);
        }
      }

      // 名前なしのアスリートはすべて unmapped
      for (const external of remainingAthletes) {
        if (!external.name && !mapped.has(external.externalId)) {
          unmapped.push(external.externalId);
        }
      }
    } else {
      // 全員名前なし
      for (const external of remainingAthletes) {
        unmapped.push(external.externalId);
      }
    }
  }

  return { mapped, unmapped };
}

// ---------------------------------------------------------------------------
// 名前マッチング
// ---------------------------------------------------------------------------

/**
 * 外部名と内部アスリートリストの中から最も近い名前を探す。
 *
 * 完全一致 → 部分一致 → カナ完全一致 の順で検索。
 *
 * @param externalName - 外部システムのアスリート名
 * @param internalAthletes - 内部アスリートリスト
 * @returns マッチしたアスリートID（なければ null）
 */
function findBestNameMatch(
  externalName: string,
  internalAthletes: Array<{ id: string; name: string; name_kana: string | null }>
): string | null {
  const normalized = normalizeName(externalName);

  // 完全一致
  for (const athlete of internalAthletes) {
    if (normalizeName(athlete.name) === normalized) {
      return athlete.id;
    }
  }

  // カナ完全一致
  for (const athlete of internalAthletes) {
    if (athlete.name_kana && normalizeName(athlete.name_kana) === normalized) {
      return athlete.id;
    }
  }

  // 部分一致（姓 or 名で一致）
  const parts = normalized.split(/[\s　]+/);
  if (parts.length >= 2) {
    for (const athlete of internalAthletes) {
      const athleteParts = normalizeName(athlete.name).split(/[\s　]+/);
      // 姓と名の両方が含まれていればマッチ
      const allMatch = parts.every((p) =>
        athleteParts.some((ap) => ap === p)
      );
      if (allMatch) {
        return athlete.id;
      }
    }
  }

  return null;
}

/**
 * 名前を正規化する（小文字化、全角→半角スペース、前後トリム）。
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
