# PACE Platform - 仕様書インデックス

各エージェントの仕様書を参照するためのインデックスです。

## エージェント仕様書一覧

| No. | エージェント | ファイル | 説明 |
|-----|-------------|---------|------|
| 05 | architect | [05-architect-spec.md](./05-architect-spec.md) | 代謝系・骨格 / SRE・アーキテクトエージェント |

## プロダクト方針ドキュメント

| ドキュメント | ファイル | 説明 |
|-------------|---------|------|
| 実装変更指示書（マスター） | [implementation-change-directive.md](./implementation-change-directive.md) | Phase A-E の開発方針・機能断捨離・コンディションスコア導入 |
| GTM & プロダクトロードマップ | [gtm-product-roadmap-2026-2028.md](./gtm-product-roadmap-2026-2028.md) | 3年ロードマップ: EBM-Bayesian → 市場民主化 → DBN/反事実 |
| 段階的要件定義書（Phased PRD） | [phased-prd-v1.md](./phased-prd-v1.md) | Phase 1-3 深掘り版: EBM-Bayesian → 自己進化 → DBN/反事実 |
| Phase 1 Web-First / PWA 仕様 | [phase1-web-first-pwa-spec.md](./phase1-web-first-pwa-spec.md) | PWA・レスポンシブ・認証・通知・ネイティブ移行戦略 |

## 次期アーキテクチャ仕様書（ヒアリング中）

| ドキュメント | ファイル | 説明 |
|-------------|---------|------|
| 6層ノード・パイプライン | [node-pipeline-architecture-v1.md](./node-pipeline-architecture-v1.md) | Node 0-5 推論パイプライン・P1-P5 階層・inference_trace_logs |
| 数理モデル高度化 v6.0 | [computational-biomechanics-v6.md](./computational-biomechanics-v6.md) | ODE損傷修復・MRF運動連鎖・応力集中・サンプルエントロピー・EKF |
| ヒアリング回答・確定事項 | [v6-hearing-decisions.md](./v6-hearing-decisions.md) | v6.0 全Q回答済み確定版（計算環境・段階性・マルチテナント等） |
| PM計画書 v6.0 | [pm-plan-v6.md](./pm-plan-v6.md) | ユーザーストーリーマップ・MVPスコープ・KPIツリー・優先順位付きバックログ |

## ADR（Architecture Decision Records）

| ADR | タイトル | ファイル |
|-----|---------|---------|
| ADR-001 | システムアーキテクチャ — レイヤー分離・Phase 6 廃止 | [ADR-001](../adr/ADR-001-system-architecture.md) |
| ADR-002 | コンディション・スコアエンジン（ハイブリッド・ピーキング） | [ADR-002](../adr/ADR-002-conditioning-score-engine.md) |
| ADR-003 | Phase 6 機能廃止（Telehealth/Insurance/Enterprise/IMU） | [ADR-003](../adr/ADR-003-feature-deprecation.md) |
