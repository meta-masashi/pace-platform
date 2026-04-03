# PACE Platform - 仕様書インデックス

**最終更新**: 2026-04-03

---

## 統合マスター仕様書（唯一の真実の源）

| ドキュメント | ファイル | 説明 |
|-------------|---------|------|
| **PACE統合マスター仕様書 v6.2** | [MASTER-SPEC-CURRENT.md](./MASTER-SPEC-CURRENT.md) | プロダクト概要、技術スタック、推論エンジン、競技別設計、MVPスコープ、バックログ、実行計画を一本化した唯一の仕様書 |

---

## ADR（Architecture Decision Records）

| ADR | タイトル | ファイル |
|-----|---------|---------|
| ADR-001 | システムアーキテクチャ -- レイヤー分離・Phase 6 廃止 | [ADR-001](../adr/ADR-001-system-architecture.md) |
| ADR-002 | コンディション・スコアエンジン（ハイブリッド・ピーキング） | [ADR-002](../adr/ADR-002-conditioning-score-engine.md) |
| ADR-003 | Phase 6 機能廃止（Telehealth/Insurance/Enterprise/IMU） | [ADR-003](../adr/ADR-003-feature-deprecation.md) |
| ADR-004 | Gemini モデルマイグレーション | [ADR-004](../adr/ADR-004-gemini-model-migration.md) |
| ADR-005 | マイグレーション戦略 | [ADR-005](../adr/ADR-005-migration-strategy.md) |
| ADR-017 | CV Addon プラン & 料金設計 | [ADR-017](../adr/ADR-017-cv-addon-plan-pricing.md) |
| ADR-019 | HIPAA Compliance BAA | [ADR-019](../adr/ADR-019-hipaa-compliance-baa.md) |
| ADR-020 | Fitness-Fatigue EWMA | [ADR-020](../adr/ADR-020-fitness-fatigue-ewma.md) |
| ADR-021 | ACWR Zones | [ADR-021](../adr/ADR-021-acwr-zones.md) |
| ADR-022 | Condition Cache Strategy | [ADR-022](../adr/ADR-022-condition-cache-strategy.md) |
| ADR-023 | AI Daily Coach | [ADR-023](../adr/ADR-023-ai-daily-coach.md) |
| ADR-024 | チェックイン UX 6ステップ | [ADR-024](../adr/ADR-024-checkin-ux-6step.md) |
| ADR-025 | Readiness 正規化 | [ADR-025](../adr/ADR-025-readiness-normalization.md) |
| ADR-026 | デザインシステム v2.0 | [ADR-026](../adr/ADR-026-design-system-v2.md) |
| ADR-028 | AI Agent トレーニングプラン | [ADR-028](../adr/ADR-028-ai-agent-training-plan.md) |

---

## 完了済み仕様書（docs/specs/completed/）

以下のドキュメントは統合マスター仕様書に内容が吸収されたか、歴史的参照用として保管されています。

| ドキュメント | ファイル | ステータス |
|-------------|---------|-----------|
| マスター指示書 v1.1 | [completed/MASTER-SPEC.md](./completed/MASTER-SPEC.md) | v6.2統合仕様書に吸収 |
| PM計画書 v6.2 | [completed/pm-plan-v6.md](./completed/pm-plan-v6.md) | v6.2統合仕様書のセクション15-17,19-20に吸収 |
| マルチスポーツ実行計画書 | [completed/execution-plan-multi-sport.md](./completed/execution-plan-multi-sport.md) | v6.2統合仕様書のセクション18,付録B-Dに吸収 |
| 実装変更指示書 v3.2 | [completed/implementation-change-directive.md](./completed/implementation-change-directive.md) | 方針確定済み。v6.2に反映 |
| GTM & プロダクトロードマップ 2026-2028 | [completed/gtm-product-roadmap-2026-2028.md](./completed/gtm-product-roadmap-2026-2028.md) | 方針確定済み |
| GTM Roadmap 2026-2028 | [completed/gtm-roadmap-2026-2028.md](./completed/gtm-roadmap-2026-2028.md) | 方針確定済み |
| 段階的PRD v1 | [completed/phased-prd-v1.md](./completed/phased-prd-v1.md) | v6.2に反映済み |
| Phase 1 Web-First PWA 仕様 | [completed/phase1-web-first-pwa-spec.md](./completed/phase1-web-first-pwa-spec.md) | 方針確定済み |
| 6層ノードパイプライン v1 | [completed/node-pipeline-architecture-v1.md](./completed/node-pipeline-architecture-v1.md) | v6.2統合仕様書のセクション7に吸収 |
| 数理モデル高度化 v6.0 | [completed/computational-biomechanics-v6.md](./completed/computational-biomechanics-v6.md) | エビデンス監査によりODE/EKF/FFM排除。参考資料 |
| v6 数学モデル | [completed/v6-mathematical-model.md](./completed/v6-mathematical-model.md) | エビデンス監査によりODE排除。参考資料 |
| v6 ヒアリング回答 | [completed/v6-hearing-decisions.md](./completed/v6-hearing-decisions.md) | 全Q回答済み確定 |
| システム監査レポート | [completed/SYSTEM-AUDIT-REPORT.md](./completed/SYSTEM-AUDIT-REPORT.md) | 監査完了 |
| Go移行リスク緩和設計書 | [completed/GO-MIGRATION-RISK-MITIGATION.md](./completed/GO-MIGRATION-RISK-MITIGATION.md) | Go推論エンジン実装済み |
| アーキテクトエージェント仕様書 | [completed/05-architect-spec.md](./completed/05-architect-spec.md) | エージェント定義 |
| UI/UXデザイン仕様書 v6 | [completed/ui-ux-design-spec-v6.md](./completed/ui-ux-design-spec-v6.md) | デザイン方針確定済み |

---

## 監査レポート（docs/audit/）

| ドキュメント | ファイル | 説明 |
|-------------|---------|------|
| ストレステスト ST1-ST2 | [../audit/stress-test-report-st1-st2.md](../audit/stress-test-report-st1-st2.md) | ストレステスト結果 |
| ストレステスト ST3-ST5 | [../audit/stress-test-report-st3-st4-st5.md](../audit/stress-test-report-st3-st4-st5.md) | ストレステスト結果 |

---

## フェーズ移行計画（docs/）

| ドキュメント | ファイル | 説明 |
|-------------|---------|------|
| Phase 4 移行計画 | [../PHASE4_TRANSITION_PLAN.md](../PHASE4_TRANSITION_PLAN.md) | Phase 4 移行詳細 |
| Phase 5 移行計画 | [../PHASE5_TRANSITION_PLAN.md](../PHASE5_TRANSITION_PLAN.md) | Phase 5 移行詳細 |
| Phase 6 移行計画 | [../PHASE6_TRANSITION_PLAN.md](../PHASE6_TRANSITION_PLAN.md) | Phase 6 移行詳細 |
