/**
 * PACE Platform — S2S データ取り込みエンジン
 *
 * 外部デバイスプロバイダーから受信したメトリクスデータを
 * 内部の daily_metrics テーブルに変換・保存する。
 *
 * 処理フロー:
 *   1. API キーの検証（SHA-256 ハッシュ照合）
 *   2. 外部アスリートID → 内部ID マッピング
 *   3. メトリクスの変換・保存
 *   4. コンディショニングスコア再計算トリガー（sRPE 受信時）
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  S2SPayload,
  S2SResult,
  S2SMetrics,
  DeviceProvider,
} from "./types";
import { mapAthletes } from "./athlete-mapper";
import { createLogger } from '@/lib/observability/logger';
const log = createLogger('s2s');

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** PlayerLoad → sRPE 近似変換係数（目安値、チームで調整可能） */
const PLAYER_LOAD_TO_SRPE_FACTOR = 0.8;

/** サポートされているプロバイダー */
const VALID_PROVIDERS: DeviceProvider[] = [
  "catapult",
  "kinexon",
  "statsports",
  "polar",
  "garmin",
  "custom",
];

// ---------------------------------------------------------------------------
// API キー検証
// ---------------------------------------------------------------------------

/**
 * API キーを SHA-256 ハッシュで検証する。
 *
 * @param supabase - Supabase クライアント（サービスロール推奨）
 * @param apiKey - 検証対象の API キー
 * @param provider - デバイスプロバイダー
 * @returns 組織ID（検証成功時）、null（失敗時）
 */
export async function validateApiKey(
  supabase: SupabaseClient,
  apiKey: string,
  provider: string
): Promise<string | null> {
  // SHA-256 ハッシュ化
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const apiKeyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  const { data: credential, error } = await supabase
    .from("s2s_credentials")
    .select("org_id")
    .eq("api_key_hash", apiKeyHash)
    .eq("provider", provider)
    .eq("is_active", true)
    .single();

  if (error || !credential) {
    return null;
  }

  return credential.org_id as string;
}

// ---------------------------------------------------------------------------
// メインの取り込み処理
// ---------------------------------------------------------------------------

/**
 * S2S データを取り込む。
 *
 * @param supabase - Supabase クライアント
 * @param payload - 外部から受信したペイロード
 * @param orgId - 認証済み組織ID（validateApiKey で取得済み）
 * @returns 取り込み結果
 */
export async function ingestS2SData(
  supabase: SupabaseClient,
  payload: S2SPayload,
  orgId: string
): Promise<S2SResult> {
  const result: S2SResult = {
    received: payload.athletes.length,
    matched: 0,
    unmatched: [],
    errors: [],
  };

  // ----- バリデーション -----
  if (!VALID_PROVIDERS.includes(payload.provider)) {
    result.errors.push(
      `サポートされていないプロバイダー: ${payload.provider}`
    );
    return result;
  }

  if (payload.athletes.length === 0) {
    return result;
  }

  // ----- アスリートマッピング -----
  const { mapped, unmapped } = await mapAthletes(
    supabase,
    orgId,
    payload.provider,
    payload.athletes
  );

  result.matched = mapped.size;
  result.unmatched = unmapped;

  if (mapped.size === 0) {
    result.errors.push(
      "マッチするアスリートが見つかりませんでした。athlete_external_ids のマッピングを確認してください。"
    );
    return result;
  }

  // ----- メトリクス変換・保存 -----
  const metricsDate = payload.timestamp
    ? new Date(payload.timestamp).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const upsertRows: Array<Record<string, unknown>> = [];
  let needsConditioningRecalc = false;

  for (const externalAthlete of payload.athletes) {
    const internalId = mapped.get(externalAthlete.externalId);
    if (!internalId) continue;

    try {
      const converted = convertMetrics(
        externalAthlete.metrics,
        payload.provider
      );

      const row: Record<string, unknown> = {
        athlete_id: internalId,
        date: metricsDate,
        ...converted,
      };

      upsertRows.push(row);

      if (converted.srpe !== undefined) {
        needsConditioningRecalc = true;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(
        `アスリート ${externalAthlete.externalId}: ${message}`
      );
    }
  }

  // ----- daily_metrics に UPSERT -----
  if (upsertRows.length > 0) {
    const { error: upsertError } = await supabase
      .from("daily_metrics")
      .upsert(upsertRows, {
        onConflict: "athlete_id,date",
        ignoreDuplicates: false,
      });

    if (upsertError) {
      log.error('daily_metrics upsert エラー', { data: { error: upsertError.message } });
      result.errors.push(
        `データ保存エラー: ${upsertError.message}`
      );
    }
  }

  // ----- コンディショニングスコア再計算（sRPE 受信時） -----
  if (needsConditioningRecalc) {
    // 非同期で再計算をトリガー（失敗しても取り込み結果には影響しない）
    triggerConditioningRecalc(supabase, mapped, metricsDate!).catch((err) => {
      log.errorFromException('コンディショニング再計算エラー', err);
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// メトリクス変換
// ---------------------------------------------------------------------------

/**
 * プロバイダー固有のメトリクスを内部形式に変換する。
 *
 * @param metrics - 外部メトリクス
 * @param provider - デバイスプロバイダー
 * @returns daily_metrics テーブルのカラムに対応するオブジェクト
 */
function convertMetrics(
  metrics: S2SMetrics,
  provider: DeviceProvider
): Record<string, number | undefined> {
  const converted: Record<string, number | undefined> = {};

  // PlayerLoad → sRPE 近似変換
  if (metrics.playerLoad !== undefined) {
    converted.srpe = Math.round(
      metrics.playerLoad * PLAYER_LOAD_TO_SRPE_FACTOR
    );
  }

  // HRV
  if (metrics.hrv !== undefined) {
    converted.hrv = metrics.hrv;
  }

  // 心拍データ
  if (metrics.heartRateAvg !== undefined) {
    converted.heart_rate_avg = metrics.heartRateAvg;
  }
  if (metrics.heartRateMax !== undefined) {
    converted.heart_rate_max = metrics.heartRateMax;
  }

  // 距離系メトリクス（JSON カラムに保存）
  if (
    metrics.totalDistance !== undefined ||
    metrics.highSpeedDistance !== undefined ||
    metrics.sprintCount !== undefined
  ) {
    // device_metrics JSON カラムに一括保存
    const deviceMetrics: Record<string, number> = {};
    if (metrics.totalDistance !== undefined) {
      deviceMetrics.total_distance_m = metrics.totalDistance;
    }
    if (metrics.highSpeedDistance !== undefined) {
      deviceMetrics.high_speed_distance_m = metrics.highSpeedDistance;
    }
    if (metrics.sprintCount !== undefined) {
      deviceMetrics.sprint_count = metrics.sprintCount;
    }
    if (metrics.accelerations !== undefined) {
      deviceMetrics.accelerations = metrics.accelerations;
    }
    if (metrics.decelerations !== undefined) {
      deviceMetrics.decelerations = metrics.decelerations;
    }
    if (metrics.impactLoad !== undefined) {
      deviceMetrics.impact_load = metrics.impactLoad;
    }

    // provider 情報も付加
    (converted as Record<string, unknown>).device_metrics = {
      provider,
      ...deviceMetrics,
    };
  }

  return converted;
}

// ---------------------------------------------------------------------------
// コンディショニング再計算トリガー
// ---------------------------------------------------------------------------

/**
 * sRPE データ受信後にコンディショニングスコアの再計算をトリガーする。
 *
 * 非同期処理のため、失敗してもデータ取り込みには影響しない。
 */
async function triggerConditioningRecalc(
  supabase: SupabaseClient,
  mappedAthletes: Map<string, string>,
  date: string
): Promise<void> {
  // 各アスリートについてコンディショニングスコアを再計算する
  // conditioning_score カラムの更新は conditioning エンジンが担当
  for (const [, athleteId] of mappedAthletes) {
    const { error } = await supabase
      .from("daily_metrics")
      .select("id")
      .eq("athlete_id", athleteId)
      .eq("date", date)
      .single();

    if (error) {
      log.warn(`アスリート ${athleteId} のメトリクス確認エラー`, { data: { error: error.message } });
    }
    // 実際の再計算は次回のコンディショニング API 呼び出し時に実行される
  }
}

// ---------------------------------------------------------------------------
// ペイロードバリデーション
// ---------------------------------------------------------------------------

/**
 * 受信ペイロードの基本バリデーション。
 *
 * @param body - リクエストボディ
 * @returns バリデーション結果
 */
export function validatePayload(
  body: unknown
): { valid: true; payload: Omit<S2SPayload, "apiKey"> } | { valid: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { valid: false, error: "リクエストボディが不正です。" };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.provider !== "string" || !VALID_PROVIDERS.includes(b.provider as DeviceProvider)) {
    return {
      valid: false,
      error: `プロバイダーが不正です。有効な値: ${VALID_PROVIDERS.join(", ")}`,
    };
  }

  if (typeof b.teamId !== "string" || b.teamId.length === 0) {
    return { valid: false, error: "teamId が必要です。" };
  }

  if (!Array.isArray(b.athletes) || b.athletes.length === 0) {
    return { valid: false, error: "athletes 配列が必要です（1件以上）。" };
  }

  // 各アスリートデータのバリデーション
  for (let i = 0; i < b.athletes.length; i++) {
    const athlete = b.athletes[i] as Record<string, unknown>;
    if (typeof athlete?.externalId !== "string") {
      return {
        valid: false,
        error: `athletes[${i}].externalId が必要です。`,
      };
    }
    if (typeof athlete?.metrics !== "object" || athlete.metrics === null) {
      return {
        valid: false,
        error: `athletes[${i}].metrics オブジェクトが必要です。`,
      };
    }
  }

  return {
    valid: true,
    payload: {
      provider: b.provider as DeviceProvider,
      teamId: b.teamId as string,
      timestamp: (b.timestamp as string) ?? new Date().toISOString(),
      athletes: b.athletes as S2SPayload["athletes"],
    },
  };
}
