/**
 * PACE Platform — S2S モジュール（バレルエクスポート）
 *
 * 外部デバイスプロバイダーとのマシン間連携に関する
 * 型・関数を再エクスポートする。
 */

// 型定義
export type {
  DeviceProvider,
  S2SPayload,
  S2SAthleteData,
  S2SMetrics,
  S2SResult,
  S2SCredential,
} from "./types";

export { PROVIDER_LABELS } from "./types";

// データ取り込み
export {
  ingestS2SData,
  validateApiKey,
  validatePayload,
} from "./ingestor";

// アスリートマッピング
export { mapAthletes } from "./athlete-mapper";
export type { MapResult } from "./athlete-mapper";
