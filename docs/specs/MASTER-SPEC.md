# PACE Platform 構造化マスター指示書

> **確定日:** 2026-04-04
> **バージョン:** v1.3（ログイン分離 + プラットフォーム管理画面 + platform_admin ロール追加）
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

### 3.5 プラットフォーム管理画面（v1.3 追加）

**ソース: v1.3 ヒアリング確定（2026-04-04）**

PACE運営会社がシステム全体を横断的に管理するための画面群。`platform_admin` ロール専用。
顧客の個別データ（選手情報・SOAPノート等）へのアクセスは情報秘匿性の観点から**禁止**。

**アクセスURL:** `/platform-admin`（同一ドメイン内。Vercel単一デプロイで完結）

#### P1: ダッシュボード（`/platform-admin`）

全体サマリー画面。以下の主要KPIをカード表示:
- 契約チーム数 / MRR / 未払いアラート件数 / システムエラー件数 / 全体利用率

#### P2: 決済状況（`/platform-admin/billing`）— 優先度1

| 項目 | 内容 |
|------|------|
| 組織別Stripe請求一覧 | 最新請求、支払い状態、請求額 |
| 未払い/Dunning状況 | 未払い組織のリスト、催促状態 |
| MRR推移グラフ | 月次・日次の収益推移 |
| 請求アクション | 手動請求再送、請求メモ追加 |

#### P3: 契約チーム基礎情報 + プラン管理（`/platform-admin/teams`）— 優先度2

| 項目 | 内容 |
|------|------|
| 契約組織一覧 | 組織名、契約日、ステータス（アクティブ/休止/解約） |
| プラン情報 | 現在のプラン（Standard/Pro/Pro+CV/Enterprise）、変更履歴 |
| プラン変更依頼管理 | 顧客からの変更リクエスト受付・承認フロー |
| チーム規模 | スタッフ数・選手数 |

> **プラン管理は契約チーム情報と同一画面に統合。** チーム選択 → プラン詳細・変更履歴が表示される構成。

#### P4: システムエラー（`/platform-admin/errors`）— 優先度3

| 項目 | 内容 |
|------|------|
| APIエラー率推移 | 時系列グラフ（1h/24h/7d） |
| エラー一覧 | Sentry連携、エラー種別・発生頻度・影響範囲 |
| Go/TSエンジン稼働状況 | ヘルスチェック結果、切替発生履歴 |

#### P5: 推論エンジン監視（`/platform-admin/engine`）— 優先度4

| 項目 | 内容 |
|------|------|
| Go/TS切替状況 | 現在のアクティブエンジン、切替履歴 |
| レイテンシ | p50/p95/p99、時系列グラフ |
| Shadow Mode結果 | Go-TS差分検出率、不一致ログ |

#### P6: 利用率（`/platform-admin/usage`）— 優先度5

| 項目 | 内容 |
|------|------|
| 組織別DAU/MAU | アクティブユーザー数推移 |
| チェックイン率 | 選手の日次入力率（組織別） |
| 機能別利用率 | アセスメント・シミュレータ・SOAP等の利用頻度 |

#### P7: エンジン成長率（`/platform-admin/engine-growth`）— 独立画面

| 項目 | 内容 |
|------|------|
| 組織別データ蓄積量 | daily_metrics / assessment 等のレコード数推移 |
| 推論精度推移 | エンジンの判定精度トレンド（データ量との相関） |
| データ品質スコア | 欠損率、チェックイン継続率、入力一貫性指標 |

> **P3（契約チーム基礎情報）とP7（エンジン成長率）は別画面。** P3はビジネス管理視点、P7はエンジン品質視点で分離。

#### Gemini API使用量（Nice-to-have）

| 項目 | 内容 |
|------|------|
| トークン消費量 | 組織別・日別のトークン使用量 |
| コスト | 月次API費用 |
| レートリミット到達状況 | 429エラー発生頻度 |

> 実装優先度は P1-P7 完了後に判断。

### 3.6 スコープ外（明確に除外）

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

#### ログインURL完全分離（v1.3 追加）

スタッフ・選手・管理者のログインURLを完全に分離し、誤操作リスクを排除する。

| 対象 | URL | 画面タイトル | 認証後の遷移先 |
|------|-----|------------|--------------|
| **スタッフ** | `/auth/login` | スタッフログイン | `/dashboard` |
| **選手** | `/auth/athlete-login` | 選手ログイン | `/home` |
| **プラットフォーム管理者** | `/auth/admin-login` | 管理者ログイン | `/platform-admin` |

**誤アクセス時の誘導:**
- 選手がスタッフURLにアクセス → 「選手の方はこちら」リンクを表示し `/auth/athlete-login` へ誘導
- スタッフが選手URLにアクセス → 「スタッフの方はこちら」リンクを表示し `/auth/login` へ誘導
- ミドルウェアでロール不一致時は正しいログインページへリダイレクト

**選手兼スタッフの制御（ロール切替スイッチ — 方式A）:**
- **スタッフURLでログイン** → スタッフ画面（`/dashboard`）に遷移。`athletes` テーブルにもレコードがある場合、ヘッダーに「選手ビューに切替」トグルを表示。トグルで `/home`（選手画面）へ遷移可能、逆も可能。
- **選手URLでログイン** → 選手画面（`/home`）のみ。スタッフビューへの切替は**不可**（セキュリティ上、選手権限からスタッフ権限への昇格は禁止）。
- ロール判定: `staff_members` テーブルの存在を優先（スタッフ兼選手はスタッフとして認識）

**選手セルフサインアップフロー:**
1. 選手が `/auth/athlete-login` から「新規登録」を選択
2. メールアドレス入力 → Magic Link 送信
3. リンクタップ後、チームコード入力画面に遷移
4. 有効なチームコード入力 → `athletes` テーブルにレコード作成 + `org_id` 紐付け
5. **チームコードの安全策（必須）:**
   - 有効期限（デフォルト7日間、master が設定可能）
   - 使用回数上限（デフォルト無制限、master が設定可能）
   - コード入力画面に「このコードはチームの管理者から受け取ったものですか？」注意喚起を表示
   - コード生成・無効化は master ロールのみ可能

#### 認証方式

| 方式 | 対象 | 優先度 | 実装 |
|------|------|--------|------|
| マジックリンク | スタッフ・選手共通 | **最推奨** | Supabase Auth（パスワード不要、リンクタップで完了） |
| Google OAuth 2.0 | スタッフ・選手共通 | 推奨 | ワンタップ SSO |
| Apple Sign-in | 選手向け | オプション | iOS ユーザー向け |
| メール + パスワード | スタッフ向け | フォールバック | 既存実装済み |

> **選手ログインの設計意図:** 選手の年齢層（高校生〜プロ）とモバイルPWA前提を踏まえ、Magic Link を最推奨。パスワード管理の負荷を排除する。LINE ログインは Phase 2 で検討。

#### RBAC（ロールベースアクセス制御）

| ロール | 権限 |
|--------|------|
| **platform_admin** | プラットフォーム管理画面（`/platform-admin`）のみアクセス可。顧客の個別データ閲覧は**不可**（情報秘匿性） |
| Admin（master） | 組織管理・課金管理・スタッフ管理（自組織内） |
| Coach / AT / S&C | チーム全選手のデータ閲覧・承認操作 |
| Doctor / PT | トレースログ含む全データ閲覧・承認権限 |
| Player（選手） | 自分のデータのみ閲覧・チェックイン入力 |

> **platform_admin の情報秘匿性ルール:** platform_admin は契約組織の集計データ（決済状況・利用率・エンジン成長率等）のみ閲覧可能。個別選手データ、個別スタッフ情報、SOAP ノート等の顧客業務データにはアクセスできない。

#### RLS ポリシー

- 全テーブルに Row Level Security 有効化
- `org_id` によるマルチテナント完全分離
- ヘルパー関数: `get_my_org_id()`, `is_master()`, `is_at_or_pt()`, `is_platform_admin()`
- Service Role キーはサーバーサイドのみ（フロントエンド厳禁）
- `platform_admin` は `org_id` によるフィルタリングの対象外だが、集計ビューのみアクセス可能（個別レコードへの直接アクセスは RLS で禁止）

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
**共通:** C1 LP、C2-S スタッフログイン、C2-A 選手ログイン、C2-P 管理者ログイン、C3 セットアップ、C4 設定、C5 組織管理者（masterのみ）
**プラットフォーム管理者向け (Desktop):** P1 ダッシュボード、P2 決済状況、P3 契約チーム基礎情報（プラン管理統合）、P4 システムエラー、P5 推論エンジン監視、P6 利用率、P7 エンジン成長率

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
| D | Staff Dashboard | YouTube Analytics スタイル KPI + アラートハブ | **85%** — チーム負荷サマリー・注意選手・リハビリ選手統合済。7AM Monopoly・承認UI未実装 |
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

### v6.2 アセスメント・シミュレータ（Sprint 1-6 完了 — 2026-04-03）

| Sprint | 内容 | SP | 完成度 |
|--------|------|-----|--------|
| S1 | SportProfile 基盤（マルチスポーツ対応） | 25 | **100%** ✅ |
| S2 | アセスメント基盤 + DB + API | 30 | **100%** ✅ |
| S3 | 3軸分析タブ UI（負荷集中・運動効率・疼痛パターン） + ダッシュボード統合 | 30 | **100%** ✅ |
| S4 | 総合評価タブ + リハビリアセスメント + シミュレータ API | 25 | **100%** ✅ |
| S5 | シミュレータ UI（コンディショニング + リハビリ） | 30 | **100%** ✅ |
| S6 | AI API（SOAP/Assessment/Intervention）+ PDF エクスポート + E2E テスト | 25 | **100%** ✅ |

**合計: 165 SP 完了**

#### 実装済み機能一覧

| カテゴリ | 機能 | ファイル |
|---------|------|---------|
| **3軸分析** | 負荷集中分析（ACWR チャート・Monotony・Strain・組織損傷ゲージ） | `tab-load-analysis.tsx` |
| | 運動効率分析（効率スコアゲージ・Decoupling・Z-Score レーダー・KPI） | `tab-efficiency-analysis.tsx` |
| | 疼痛パターン分析（NRS×sRPE 二軸チャート・相関バッジ・既往歴テーブル） | `tab-pain-analysis.tsx` |
| | 総合評価（リスクサマリー・KPI・パターンアラート・スタッフノート） | `tab-summary.tsx` |
| **リハビリ** | リハビリアセスメント（回復進捗・NRS トレンド・基準チェックリスト・処方カード） | `tab-rehab-assessment.tsx` |
| **シミュレータ** | コンディショニングシミュレータ（EWMA 前方投影・Monotony/Strain・意思決定タイムライン） | `simulator/conditioning/page.tsx` |
| | リハビリシミュレータ（組織負荷分析・回復予測・フェーズ遷移・復帰タイムライン） | `simulator/rehab/page.tsx` |
| **ダッシュボード統合** | チーム負荷サマリー・注意選手カード・リハビリ選手カード | `team-load-summary.tsx`, `attention-athlete-card.tsx` |
| **AI API** | SOAP アシスト（テンプレート + Gemini 対応構造） | `api/ai/soap-assist/route.ts` |
| | アセスメント提案（カテゴリ別介入・フォローアップ） | `api/ai/assessment-suggest/route.ts` |
| | 介入提案（シナリオプリセット・エクササイズ推奨） | `api/ai/intervention-suggest/route.ts` |
| **エクスポート** | PDF エクスポート（コンディショニング/リハビリ/SOAP、Pro 専用） | `api/assessment/export-pdf/route.ts` |
| **テスト** | E2E テスト（アセスメントフロー 31件 + シミュレータフロー 35件） | `__tests__/e2e/` |

#### 数理モデル

| モデル | 実装 |
|--------|------|
| EWMA-ACWR | λ_acute=0.25, λ_chronic≈0.069, 42日間データ |
| Monotony & Strain | mean/SD of daily load |
| 組織損傷モデル | 4カテゴリ半減期（metabolic=1d, structural_soft=3d, structural_hard=7d, neuromotor=2d） |
| Decoupling Index | sRPE/HRV 比率 |
| Z-Score ウェルネス | sleep/fatigue/mood/stress/soreness |
| NRS-Load 相関 | ピアソン相関係数 |
| 組織負荷上限 | TISSUE_LOAD_CEILING=0.3 |

### セキュリティ強化（2026-04-03）

| 深刻度 | 件数 | 対応内容 |
|--------|------|---------|
| CRITICAL | 5 | 認証コールバックのオープンリダイレクト修正、IDOR 修正（ロック削除・アセスメント回答・リルート提案） |
| HIGH | 12 | 全 API エンドポイントにスタッフ検証 + org_id スコープ追加、認証前 body 解析の修正、レイアウト認証強化 |
| MEDIUM | 5 | SOAP PATCH サニタイズ、staffNotes サニタイズ、エラー詳細漏洩修正、iframe サンドボックス化 |

### `[PENDING]` v6.0 拡張（ヒアリング完了後に計画策定）

以下は仕様が未確定のため、現時点では実装対象外とする。
ヒアリング完了後に MVP スコープへの追加を再評価する。

- Damage-Remodeling ODE（Python マイクロサービス）
- EKF デカップリング検出（Python マイクロサービス）
- Deep Space テーマ（Bio-War Room）
- Evidence Vault

### `[DRAFT]` GTM タイムライン（参考 — 確定後に更新）

```
2026 Q2 ── Phase 1 開始 ──
  Phase A-E 完成
  EBM-Bayesian Engine 稼働（CSV → DAG）
  v6.2 アセスメント・シミュレータ稼働
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

=== 構造化マスター指示書 v1.2 確定 ===
