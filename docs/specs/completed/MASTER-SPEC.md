# PACE Platform 構造化マスター指示書

> **確定日:** 2026-03-25
> **バージョン:** v1.1（仕様優先度階層の厳格適用）
> **ステータス:** 確定版

---

## 0. 仕様優先度階層（本文書の読み方）

本文書は複数の入力仕様書を統合しているが、各仕様の確定ステータスが異なる。
**衝突時は上位が常に優先する。**

| 優先度 | ステータス | 対象文書 | 本文書での表記 |
|--------|----------|---------|-------------|
| **L1（最優先）** | 確定版 | implementation-change-directive.md, v6-hearing-decisions.md, ADR-001〜028 | 無印 |
| **L2（確定）** | 確定版 | phased-prd-v1.md, phase1-web-first-pwa-spec.md, ui-ux-design-spec-v6.md, SECURITY.md | 無印 |
| **L3（参考）** | ドラフト | pm-plan-v6.md, gtm-product-roadmap-2026-2028.md | `[DRAFT]` |
| **L4（未確定）** | ヒアリング中 | node-pipeline-architecture-v1.md, computational-biomechanics-v6.md, v6-mathematical-model.md | `[PENDING]` |

**原則:**
- `[DRAFT]` 項目は方向性の参考であり、実装の根拠としない
- `[PENDING]` 項目はヒアリング完了まで MVP スコープに含めない
- 実装変更指示書が「既存PM計画書・アーキテクチャ仕様を上書き」と明記しているため、L1 が L3/L4 に常に優先する

---

## 1. プロダクト概要

- **プロダクト名:** PACE Platform（Performance Analytics & Conditioning Engine）
- **解決する課題:** スポーツ現場における傷害予防の意思決定が「経験と勘」に依存しており、エビデンスに基づく定量的リスク評価と自律的メニュー生成が欠如している。既存 AMS（Kitman Labs 等）はブラックボックス ML であり、医療従事者の信頼を得られていない。
- **ターゲットユーザー:**
  - **Phase 1（2026 Q2-Q4）:** Catapult 等ウェアラブル導入済みのプロ球団・代表チーム。チームドクター、AT（アスレティックトレーナー）、PT（理学療法士）、S&C コーチ。ITリテラシー: 中〜高。
  - **Phase 2（2027）:** ユース、アマチュア、大学スポーツ、リハビリクリニック。スマホ完結型ユーザー。
  - **Phase 3（2028〜）:** メガクラブ、最高峰スポーツ医療機関、高単価プレミアム層。
- **収益モデル:** サブスクリプション（月額課金）

| プラン | 月額 | 内容 |
|--------|------|------|
| Standard | 10万円 | 選手管理・SOAP・基本分析 |
| Pro | 30万円 | Standard + LLM 分析・高度ダッシュボード |
| Pro + CV Addon | 50万円 | Pro + CV 解析 API（50本/月） |
| Enterprise | 60万円 | Pro + CV Addon + 複数チーム管理 |

---

## 2. 技術スタック（固定）

| レイヤー | 技術 | 備考 |
|---------|------|------|
| フロントエンド | Next.js 15 (App Router) + Tailwind CSS 3 + React 19 | Vercel デプロイ、PWA 対応 |
| 状態管理 | Zustand + TanStack React Query | サーバー/クライアント状態分離 |
| API 層 | Supabase Edge Functions (TypeScript/Deno) | ビジネスロジック・認証・レートリミット |
| BFF 層 | Next.js API Routes | 最小限（SSR データフェッチ用） |
| データ層 | Supabase PostgreSQL + pgvector | RLS によるマルチテナント分離 |
| AI/LLM | Gemini API (@google/generative-ai) | NLG テキスト成形・インサイト生成 |
| 決済 | Stripe | サブスク・Webhook・冪等性保証 |
| 認証 | Supabase Auth | マジックリンク・Google OAuth・Apple Sign-in |
| CI/CD | GitHub Actions | lint → test → build → deploy |
| インフラ | Vercel（フロント）+ Supabase（バック） | |

---

## 3. MVP スコープ（Phase 1 — 確定機能のみ）

### 3.1 コアエンジン

**ソース: implementation-change-directive.md (L1), phased-prd-v1.md (L2), ADR-002 (L1)**

| # | 機能 | 説明 | 実装状況 |
|---|------|------|---------|
| M1 | **EBM-Bayesian Engine** | CSV データ（P0〜F5, A3, A5）の LR_Yes/No をベイズ DAG としてロード。決定論的推論（ブラックボックス ML 禁止）。 | ✅ 実装済（bayesian-engine.ts） |
| M2 | **タグ・コンパイラ** | リスク確率閾値超過時にメニュー自動再構築。禁忌タグ（`!#` マーク）最強権限 → 強制削除 → 代替処方タグ挿入。 | ✅ 実装済（computeSummary） |
| M3 | **コンディション・スコア（ハイブリッド・ピーキング）** | Fitness(42日EWMA) - Fatigue(7日EWMA + 主観ペナルティ) → 0-100 正規化。Pro Mode: HRV ペナルティ係数。 | ✅ 実装済（migration 015, condition-score API） |
| M4 | **ACWR 算出** | 急性(7日)/慢性(28日)負荷比。安全(<0.8)/最適(0.8-1.3)/注意(1.3-1.5)/危険(>1.5)。Hard Lock: ACWR>1.5 で強度制限。 | ✅ 実装済（condition_cache） |
| M5 | **AI Daily Coach** | Gemini 2.0 Flash によるパーソナライズドアドバイス。ルールベースフォールバック。医療免責事項必須。 | ✅ 実装済（daily-coach API, gemini-client.ts） |

### 3.2 データ入力

**ソース: implementation-change-directive.md (L1), ADR-024 (L1), phased-prd-v1.md (L2)**

| # | 機能 | 説明 | 実装状況 |
|---|------|------|---------|
| M6 | **6ステップチェックイン（選手入力）** | sRPE・睡眠品質・疲労感。高負荷翌日は Fatigue Focus 3問に絞り込み。 | ✅ 実装済（checkin API, ADR-024） |
| M7 | **CSV インポーター UI** | assessment_nodes へのCSVアップロード・プレビュー・バリデーション画面。 | ❌ 未実装（バックエンドのみ） |
| M8 | **ルーティング・ウィザード** | Routing_v4.3条件式に基づく質問分岐UIフロー。 | ❌ 未実装 |

### 3.3 UI/UX

**ソース: implementation-change-directive.md (L1), phase1-web-first-pwa-spec.md (L2), ui-ux-design-spec-v6.md (L2)**

| # | 機能 | 説明 | 実装状況 |
|---|------|------|---------|
| M9 | **GlowingCore（アスリートホーム）** | コンディション・スコアのリング表示。teal(最適)〜red(回復優先)グラデーション。3大サブ指標カード（Fitness/Fatigue/ACWR）。 | ❌ 未実装 |
| M10 | **7 AM Monopoly ダッシュボード** | 朝一画面100%を「NLG アラート + 修正済みメニュー案」持つ選手カードで占有。生データは下部スクロール。 | ❌ 未実装 |
| M11 | **ワンタップ・アプルーバル** | Approve / Edit / Reject 3アクション。WORM ログ連携。 | ❌ 未実装（UIのみ。WORM テーブルは実装済） |
| M12 | **4大KPIカード（Staff）** | Critical アラート / プレー可能率 / コンディション・スコア平均 / Watchlist。 | ✅ 実装済（kpi-card.tsx, team-condition API） |
| M13 | **ACWR トレンドチャート** | 過負荷閾値1.5にamber点線、14日間推移グラフ。 | ❌ 未実装 |
| M14 | **Today's Action ハブ** | 異常検知選手の優先表示。`.rank-dot`（赤・黄）で緊急性表示。 | ❌ 未実装 |
| M15 | **Google カレンダー連携** | OAuth フロー → イベント同期 → 負荷予測オーバーレイ。 | ❌ 未実装（DBスキーマのみ） |
| M16 | **PWA 完成** | layout.tsx メタタグ、インストール促進バナー、オフラインバッジ。 | ❌ 未実装（sw.js/manifest.jsonのみ） |

### 3.4 監査・セキュリティ

**ソース: phased-prd-v1.md (L2), SECURITY.md (L2)**

| # | 機能 | 説明 | 実装状況 |
|---|------|------|---------|
| M17 | **approval_audit_logs（WORM）** | 承認/却下ログ。INSERT only。data_hash 付与。 | ✅ 実装済（migration 018） |
| M18 | **inference_trace_logs** | 推論監査ログ。トレース ID 貫通。WORM。 | ✅ 実装済（migration 021） |
| M19 | **RLS ポリシー** | Player（自分のみ）/ Coach（チーム全員）/ Doctor（全データ）。org_id 完全分離。 | ✅ 実装済 |
| M20 | **法的免責事項 + 人間承認フロー** | 全 AI 出力に医療免責注記。P1-P2 は有資格スタッフ承認必須。 | ❌ 未実装（UI未実装） |

### 3.5 スコープ外（明確に除外）

| 機能 | 除外理由 | ソース |
|------|---------|--------|
| テレヘルス | 廃止決定 | ADR-003 (L1) |
| 保険請求連携 | 廃止決定 | ADR-003 (L1) |
| エンタープライズ管理 | 凍結 | ADR-003 (L1) |
| IMU リアルタイム連携 | 廃止決定 | ADR-003 (L1) |
| ネイティブモバイルアプリ | Web-First/PWA 方針 | phase1-web-first-pwa-spec (L2) |
| DBN / 反事実推論 | Phase 3（2028年以降） | phased-prd-v1 (L2) |
| `[PENDING]` 6層ノード・パイプライン | 仕様ヒアリング中 | node-pipeline-architecture-v1 (L4) |
| `[PENDING]` Damage-Remodeling ODE | Python マイクロサービス基盤が未構築。ヒアリング完了後に判断 | computational-biomechanics-v6 (L4) |
| `[PENDING]` EKF デカップリング検出 | Python マイクロサービス基盤が未構築。ヒアリング完了後に判断 | computational-biomechanics-v6 (L4) |
| `[PENDING]` P1-P5 優先度階層 | 6層パイプライン仕様に依存。ヒアリング完了後に判断 | node-pipeline-architecture-v1 (L4) |
| `[PENDING]` MRF 運動連鎖 | Phase 2 | v6-hearing-decisions (L1) |
| `[PENDING]` 応力集中テンソル | Phase 2 | v6-hearing-decisions (L1) |
| `[PENDING]` サンプルエントロピー | Phase 3（100Hz IMU 必要） | v6-hearing-decisions (L1) |
| `[DRAFT]` Sprint 1-6 計画 | PM計画書がドラフト状態。確定後に採用 | pm-plan-v6 (L3) |
| `[DRAFT]` MDT コパイロット画面 | PM計画書がドラフト状態。確定後に採用 | pm-plan-v6 (L3) |

> **注記: ODE / EKF について**
> `v6-hearing-decisions.md`（L1 確定版）は ODE と EKF を MVP スコープと記載している。
> ただし、これらは Python マイクロサービス基盤（AWS Lambda / GCP Cloud Functions）の構築を前提とし、
> 仕様の詳細は `computational-biomechanics-v6.md`（L4 ヒアリング中）と `node-pipeline-architecture-v1.md`（L4 ヒアリング中）に依存する。
> **ヒアリング完了後に MVP スコープへの追加を判断する。** 現時点では Phase A-E の完成を最優先とする。

---

## 4. 必須コア要件

### 4-1. DB スキーマ要件

#### 既存テーブル（維持・拡張 — 全て確定済み）

| テーブル | 用途 | マイグレーション |
|---------|------|--------------|
| `organizations` | チーム・組織マスタ | 001 |
| `athletes` | 選手マスタ | 001 |
| `staff_members` | スタッフマスタ | 001 |
| `daily_metrics` | 日次指標（sRPE, ACWR, HRV, 睡眠等） | 001 + 015拡張 |
| `assessment_sessions` / `assessment_nodes` | アセスメント・ベイズ推論ノード | 001 |
| `rehabilitation_programs` / `rehab_phases` | リハビリ管理 | 005 |
| `cv_analyses` / `cv_body_parts` | CV 解析結果 | 006 |
| `billing_*` | Stripe 決済 | 013 |
| `conditioning_score` 関連カラム | コンディション・スコア | 015 |
| `calendar_connections` / `schedule_events` | Google カレンダー連携 | 016 |
| `approval_audit_logs` | 承認監査ログ（WORM） | 018 |
| `inference_trace_logs` | 推論監査ログ | 021 |
| `s2s_connections` / `s2s_ingestion_logs` | S2S 連携 | 022 |
| `athlete_condition_cache` | コンディションキャッシュ | 20260324 |

#### daily_metrics 拡張カラム（015 マイグレーション — 確定済み）

```sql
srpe FLOAT                    -- session RPE
training_duration_min INT     -- トレーニング時間
rpe FLOAT CHECK (0-10)        -- 主観的運動強度
fatigue_subjective FLOAT      -- 主観疲労
conditioning_score FLOAT      -- コンディション・スコア (0-100)
fitness_ewma FLOAT            -- 42日 EWMA キャッシュ
fatigue_ewma FLOAT            -- 7日 EWMA キャッシュ
hrv_baseline FLOAT            -- HRV ベースライン (Pro Mode)
```

#### インデックス要件

- `daily_metrics`: (athlete_id, date) UNIQUE, (organization_id, date)
- `inference_trace_logs`: (athlete_id, created_at DESC), (organization_id)
- `approval_audit_logs`: (athlete_id, created_at DESC)
- `assessment_nodes`: (session_id), (node_id)

#### 廃止テーブル（コードから削除済み、DB は残存 — ADR-003 確定）

- `telehealth_sessions`, `telehealth_consent_records`, `telehealth_audit_log`
- `billing_codes`, `billing_claims`
- `imu_devices`, `imu_sessions`
- `ai_plan_jobs`, `weekly_plans`

### 4-2. 認証・アクセス制御要件

#### 認証方式

| 方式 | 優先度 | 実装 |
|------|--------|------|
| マジックリンク | 推奨 | Supabase Auth |
| Google OAuth 2.0 | 推奨 | ワンタップ SSO |
| Apple Sign-in | オプション | iOS ユーザー向け |
| メール + パスワード | フォールバック | 既存実装済み |

#### RBAC（ロールベースアクセス制御）

| ロール | 権限 |
|--------|------|
| Player（選手） | 自分のデータのみ閲覧・チェックイン入力 |
| Coach / AT / S&C | チーム全選手のデータ閲覧・承認操作 |
| Doctor / PT | トレースログ含む全データ閲覧・承認権限 |
| Admin | 組織管理・課金管理・スタッフ管理 |

#### RLS ポリシー

- 全テーブルに Row Level Security 有効化
- `org_id` によるマルチテナント完全分離
- ヘルパー関数: `get_my_org_id()`, `is_master()`, `is_at_or_pt()`
- Service Role キーはサーバーサイドのみ（フロントエンド厳禁）

#### セキュリティ防壁（4大防壁 — 全 API 箇所に適用）

| 防壁 | 内容 |
|------|------|
| 防壁1: モック排除 | ダミーデータ・TODO 等禁止。実動コードのみ |
| 防壁2: AI セキュリティ | `sanitizeUserInput()`（35+ パターン）、`detectHarmfulOutput()`（28+ パターン）、医療免責事項必須 |
| 防壁3: コスト保護 | ユーザー別レートリミット・トークン追跡を全 API 箇所に組み込み |
| 防壁4: 耐障害性 | JSON パース失敗時に最大3回の指数バックオフ付きリトライ |

### 4-3. デザイン要件

#### デザイン・フィロソフィー: "Complexity to Clarity"

- **Math-Invisible Design:** 数式を UI に直接表示しない。`ACWR` → 「負荷バランス」等
- **3-Layer Information Architecture:** Layer 1（Status: 1秒で状況把握）→ Layer 2（Narrative: なぜ？）→ Layer 3（Evidence: 数理的証跡）

#### カラーシステム

**Light テーマ（アスリート PWA / スタッフ通常）:**
- Brand Green: `#10b981` (160 84% 39%)
- Brand-600（白背景通常テキスト用）: `#059669`

#### タイポグラフィ

- 本文: `Noto Sans JP`, `Inter`, sans-serif (16px, line-height 1.75)
- UI ラベル: `Inter`, `Noto Sans JP` (12px)
- KPI 数値: 40px, tabular-nums
- スコア中央: 56px (score-hero)

#### MVP 必須コンポーネント

1. **GlowingCore** — アスリートホーム中央円（240px/280px、脈動アニメーション）
2. **ActionOfTheDay** — 今日の行動指針カード
3. **AdaptiveCheckinForm** — 動的チェックインフォーム（Fatigue Focus / Vigor 分岐）

> `[PENDING]` 以下は v6.0 仕様確定後に追加判断:
> BioScanOverlay, BodyModel3D, InconsistencyMeter, InnovationPlot, WhatIfSimulator, OneClickAudit

#### MVP 画面一覧

**アスリート向け (Mobile PWA):** A1 ホーム（GlowingCore）、A2 チェックイン、A4 履歴
**スタッフ向け (Tablet/Desktop):** S1 ダッシュボード（7AM Monopoly）、S2 トリアージ、S3 選手詳細、S4 アセスメント、S9 リハビリ、S10 SOAP
**共通:** C1 LP、C2 ログイン、C3 セットアップ、C4 設定、C5 管理者

> `[PENDING]` 以下は v6.0 仕様確定後に追加判断:
> A3 Bio-Scan、S5 What-If、S6 3D ヒートマップ、S7 デカップリング、S8 Evidence Vault、S11 レポート

#### レスポンシブ・アクセシビリティ

- モバイルファースト設計（default → md:768px → lg:1024px → xl:1280px）
- WCAG 2.1 AA 準拠（コントラスト比 4.5:1、タッチターゲット 44x44px、prefers-reduced-motion 対応）
- PWA: manifest.json + Service Worker + オフラインキャッシュ + 「ホーム画面に追加」

### 4-4. 日本市場対応要件

#### 日本語ネイティブ UI

- 全 UI テキスト日本語（推奨アクション・アラート・法的免責事項）
- フォント: Noto Sans JP を第一候補
- 日本語本文: 最低 14px、line-height 1.6 以上

#### 商習慣準拠

- 料金体系: 円建て月額（10万/30万/50万/60万円）
- 消費税（10%）の適切な表示

#### 法的要件

- **医療免責事項:** 全 AI 出力に「本システムは臨床判断の補助ツールであり、医療行為の代替ではありません」を表示
- **P1-P2 推奨の自動実行禁止:** 有資格スタッフの承認フロー必須
- **個人情報保護法準拠:** org_id による完全テナント分離、RLS、データ暗号化
- **特定商取引法:** LP にプラン料金・解約条件・運営者情報を明記
- **WORM 監査ログ:** approval_audit_logs は INSERT only（UPDATE/DELETE 禁止）

---

## 5. 非機能要件

### パフォーマンス

| 指標 | 目標 |
|------|------|
| ダッシュボード初期表示 | < 3秒（LCP） |
| API レスポンス | < 500ms（p95） |
| Gemini NLG 応答 | < 5秒（フォールバック: テンプレート即時表示） |

### スケーラビリティ（MVP 想定）

| 項目 | 目標 |
|------|------|
| 同時接続チーム数 | 〜50チーム |
| 選手データ件数 | 〜5,000選手 |

### 監視・オブザーバビリティ

- `analytics_events` テーブル（011）
- `observability` テーブル群（014）
- inference_trace_logs による推論トレーサビリティ

---

## 6. 開発フェーズと現在の状態

### Phase A-E（確定 — L1: 実装変更指示書に基づく）

| Phase | 名前 | 内容 | 完成度 |
|-------|------|------|--------|
| A | Cleanup | 不要機能廃止（Telehealth/Billing/IMU） | **100%** ✅ |
| B | Engine | コンディション・スコア算出ロジック | **95%** ✅ |
| C | Athlete UI | Oura Ring スタイル・サークル UI + モバイル画面 | **40%** — GlowingCore・サブ指標カード未実装 |
| D | Staff Dashboard | YouTube Analytics スタイル KPI + アラートハブ | **70%** — 7AM Monopoly・チャート・承認UI未実装 |
| E | Calendar Hub | Google カレンダー連携・負荷予測オーバーレイ | **20%** — DBスキーマのみ、OAuth/同期/予測未実装 |

### PRD Phase 1 残作業（確定 — L2: phased-prd-v1 に基づく）

| 項目 | 完成度 |
|------|--------|
| CSV インポーター UI | ❌ 未実装 |
| ルーティング・ウィザード UI | ❌ 未実装 |
| メニュー自律生成 UI（禁忌ブロック結果表示） | ❌ 未実装 |
| エビデンス・テキスト表示カード | ❌ 未実装 |
| 法的免責事項 UI + 人間承認フロー | ❌ 未実装 |

### PWA 残作業（確定 — L2: phase1-web-first-pwa-spec に基づく）

| 項目 | 完成度 |
|------|--------|
| PWA メタタグ（layout.tsx） | ❌ 未実装 |
| インストール促進バナー統合 | ❌ 未実装 |
| オフラインバッジ | ❌ 未実装 |
| Web Push 通知 | ❌ 未実装 |

### `[PENDING]` v6.0 拡張（ヒアリング完了後に計画策定）

以下は仕様が未確定のため、現時点では実装対象外とする。
ヒアリング完了後に MVP スコープへの追加を再評価する。

- 6層ノード・パイプライン基盤（Node 0-5）
- Damage-Remodeling ODE（Python マイクロサービス）
- EKF デカップリング検出（Python マイクロサービス）
- P1-P5 優先度階層 + コンテキスト・オーバーライド
- Deep Space テーマ（Bio-War Room）
- MDT コパイロット画面
- What-If シミュレータ
- Evidence Vault

### `[DRAFT]` GTM タイムライン（参考 — 確定後に更新）

```
2026 Q2 ── Phase 1 開始 ──
  Phase A-E 完成
  EBM-Bayesian Engine 稼働（CSV → DAG）
  7 AM Monopoly + ワンタップ承認
  PWA 完成
  プロ球団 初期顧客獲得
2026 Q4 ── Phase 1 完了 ──
```

### KPI トップゴール

**「スポーツ傷害の発生率を 30% 低減する」**

- 獲得: 月間新規チーム登録数、トライアル開始率、CSV アップロード完了率
- 活性化: 初回推論実行完了率
- エンゲージメント: 推奨アクション承認率、sRPE 入力継続率
- リテンション: 月次チーム継続率（M1/M3/M6）、NPS スコア
- 収益: MRR、ARPU

---

## 関連ドキュメント

### L1（確定・最優先）

| ドキュメント | パス |
|-------------|------|
| 実装変更指示書 | `docs/specs/implementation-change-directive.md` |
| ヒアリング確定事項 | `docs/specs/v6-hearing-decisions.md` |
| ADR-001 アーキテクチャ | `docs/adr/ADR-001-system-architecture.md` |
| ADR-002 コンディション・スコア | `docs/adr/ADR-002-conditioning-score-engine.md` |
| ADR-003 機能廃止 | `docs/adr/ADR-003-feature-deprecation.md` |
| ADR-017 CV Addon 料金 | `docs/adr/ADR-017-cv-addon-plan-pricing.md` |

### L2（確定）

| ドキュメント | パス |
|-------------|------|
| 段階的 PRD v1.0 | `docs/specs/phased-prd-v1.md` |
| Phase 1 Web-First/PWA | `docs/specs/phase1-web-first-pwa-spec.md` |
| UI/UX 仕様書 v6.0 | `docs/specs/ui-ux-design-spec-v6.md` |
| セキュリティポリシー | `SECURITY.md` |

### L3（ドラフト — 参考）

| ドキュメント | パス |
|-------------|------|
| PM 計画書 v6.0 | `docs/specs/pm-plan-v6.md` |
| GTM ロードマップ | `docs/specs/gtm-product-roadmap-2026-2028.md` |
| GTM & プロダクトロードマップ | `docs/specs/gtm-roadmap-2026-2028.md` |

### L4（ヒアリング中 — 実装対象外）

| ドキュメント | パス |
|-------------|------|
| 6層パイプライン仕様 | `docs/specs/node-pipeline-architecture-v1.md` |
| 数理モデル v6.0 | `docs/specs/computational-biomechanics-v6.md` |
| 数理モデル（数学） | `docs/specs/v6-mathematical-model.md` |

---

=== 構造化マスター指示書 v1.1 確定 ===
