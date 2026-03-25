/**
 * PACE Platform — S2S（Server-to-Server）API 型定義
 *
 * 外部デバイス（Catapult, Kinexon, StatSports 等）からの
 * マシン間データ送信に使用する型を定義する。
 */

// ---------------------------------------------------------------------------
// デバイスプロバイダー
// ---------------------------------------------------------------------------

/** サポート対象のデバイスプロバイダー */
export type DeviceProvider =
  | "catapult"
  | "kinexon"
  | "statsports"
  | "polar"
  | "garmin"
  | "custom";

/** プロバイダーの表示名マッピング */
export const PROVIDER_LABELS: Record<DeviceProvider, string> = {
  catapult: "Catapult Sports",
  kinexon: "Kinexon",
  statsports: "STATSports",
  polar: "Polar",
  garmin: "Garmin",
  custom: "カスタム",
};

// ---------------------------------------------------------------------------
// 受信ペイロード
// ---------------------------------------------------------------------------

/**
 * S2S API の受信ペイロード。
 *
 * 外部システムから POST /api/s2s/ingest に送信されるデータ。
 */
export interface S2SPayload {
  /** デバイスプロバイダー名 */
  provider: DeviceProvider;
  /** API キー（Authorization ヘッダーで渡す） */
  apiKey: string;
  /** プロバイダー側のチームID */
  teamId: string;
  /** データのタイムスタンプ（ISO 8601） */
  timestamp: string;
  /** アスリートデータ配列 */
  athletes: S2SAthleteData[];
}

/**
 * 個別アスリートのデバイスデータ。
 */
export interface S2SAthleteData {
  /** プロバイダー側のアスリートID */
  externalId: string;
  /** マッチング用の選手名 */
  name?: string;
  /** メトリクスデータ */
  metrics: S2SMetrics;
}

/**
 * デバイスから取得するメトリクス。
 *
 * プロバイダーによって利用可能なメトリクスは異なる。
 * 未対応のメトリクスは undefined となる。
 */
export interface S2SMetrics {
  /** Catapult PlayerLoad（AU） */
  playerLoad?: number;
  /** 総走行距離（メートル） */
  totalDistance?: number;
  /** 高速走行距離（> 5.5 m/s、メートル） */
  highSpeedDistance?: number;
  /** スプリント回数 */
  sprintCount?: number;
  /** 加速回数 */
  accelerations?: number;
  /** 減速回数 */
  decelerations?: number;
  /** 平均心拍数（bpm） */
  heartRateAvg?: number;
  /** 最大心拍数（bpm） */
  heartRateMax?: number;
  /** HRV（ms） */
  hrv?: number;
  /** 衝撃負荷（受傷リスク用） */
  impactLoad?: number;
  /** 拡張可能なメトリクス */
  [key: string]: number | undefined;
}

// ---------------------------------------------------------------------------
// 処理結果
// ---------------------------------------------------------------------------

/**
 * S2S データ取り込みの結果。
 */
export interface S2SResult {
  /** 受信したアスリートデータ数 */
  received: number;
  /** 内部アスリートに紐づけできた数 */
  matched: number;
  /** 紐づけできなかった外部IDリスト */
  unmatched: string[];
  /** 処理エラーメッセージリスト */
  errors: string[];
}

// ---------------------------------------------------------------------------
// 資格情報
// ---------------------------------------------------------------------------

/**
 * S2S API 資格情報。
 */
export interface S2SCredential {
  /** 資格情報ID */
  id: string;
  /** 組織ID */
  orgId: string;
  /** プロバイダー名 */
  provider: DeviceProvider;
  /** 有効フラグ */
  isActive: boolean;
  /** 作成日 */
  createdAt: string;
}
