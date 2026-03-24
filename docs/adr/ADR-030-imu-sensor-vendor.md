# ADR-030: IMUセンサーベンダー選定

**ステータス:** 採用  
**決定日:** 2026-03-24  
**決定者:** @05-architect  

## コンテキスト

Phase 6 Sprint 7 で実装する IMU センサー連携のベンダーを選定する。BLE 経由でデータを取得し ACWR 計算に統合する。

## 選定比較

| ベンダー | BLE SDK | Expo 互換 | API 仕様公開 | コスト |
|---------|---------|-----------|-------------|--------|
| Catapult (Vector) | ✅ | ✅ | 要契約 | 高 |
| Polar (H10) | ✅ | ✅ | 公開 | 低 |
| Garmin (HRM-Pro) | ✅ | ⚠️ 要設定 | 公開 | 中 |
| **汎用 BLE (react-native-ble-plx)** | ✅ | ✅ | — | 無償 |

## 決定内容

**Polar H10 + react-native-ble-plx** を採用。

理由:
1. Polar H10 は加速度・心拍数・RR間隔を BLE GATT 標準プロファイルで公開
2. `react-native-ble-plx` は Expo managed workflow で動作実績あり
3. SDK が MIT ライセンスで無償
4. API 仕様（Polar Measurement Data / PMD Service）が公開文書化されている

## IMU データ → ACWR 統合方針

- 加速度 (g) → PlayerLoad 換算 → `daily_load` カラムに加算
- `athlete_condition_cache` の EWMA 計算で ACWR に反映
- `imu_sessions` テーブルで生センサーデータを保存（S3 バックアップ）
