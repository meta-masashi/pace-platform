/**
 * PACE Platform — RTS 予測モジュール（バレルエクスポート）
 *
 * 復帰予測に関する型・関数を再エクスポートする。
 */

// 型定義
export type {
  RTSPrediction,
  RTSMilestone,
  RTSRiskFactor,
  RecoveryDataPoint,
  DailyMetric,
  GateProgress,
  DecayStatus,
} from './types';

// 予測エンジン
export { predictRTS, generateRecoveryCurve } from './predictor';
