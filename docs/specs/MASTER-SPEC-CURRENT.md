# PACE Platform マスター仕様書
## Performance Analytics & Conditioning Engine

**バージョン**: v6.1
**最終更新**: 2026-04-01
**対象競技**: サッカー（Football）
**URL**: https://hachi-riskon.com
**エビデンス基準**: Oxford CEBM Level 2 以上のみ判定ロジックに採用

---

## 目次

1. [プロダクト概要](#1-プロダクト概要)
2. [技術スタック](#2-技術スタック)
3. [システム構成図](#3-システム構成図)
4. [ユーザーと権限](#4-ユーザーと権限)
5. [画面一覧](#5-画面一覧)
6. [推論エンジン](#6-推論エンジン)
7. [判定ロジック（P1-P5）](#7-判定ロジックp1-p5)
8. [新機能：品質ゲート・傾向通知・専門家委譲](#8-新機能)
9. [データベース設計](#9-データベース設計)
10. [API一覧](#10-api一覧)
11. [認証・セキュリティ](#11-認証セキュリティ)
12. [外部サービス連携](#12-外部サービス連携)
13. [環境変数](#13-環境変数)

---

## 1. プロダクト概要

### PACEとは

PACEは、サッカーチームのアスレティックトレーナー（AT）やコーチが、選手のコンディションを科学的に管理するためのWebアプリケーションです。

選手が毎日入力する「体の調子」データをもとに、AIが「今日トレーニングしても大丈夫か」を4色（緑・黄・橙・赤）で判定します。

### 3つの判定レベル

| レベル | 表示 | 説明 |
|--------|------|------|
| **確定判定** | RED / ORANGE / GREEN | 閾値を明確に超えたケース |
| **傾向通知** | YELLOW + 傾向メッセージ | データが閾値に接近中（判定は変えない） |
| **専門家委譲** | YELLOW + 要確認フラグ | データ品質不足で自動判定を抑制 |

### 設計原則

1. **判定ロジックは100%確定的** — LLMの出力を判定に使ってはならない
2. **品質問題時は判定しない** — 専門家に委ねる
3. **傾向は通知するが判定は変えない** — 接近中を知らせるだけ
4. **エビデンスベース** — Level 2以上の文献のみ
5. **TypeScript版は削除しない** — Goがダウンしたら即フォールバック

---

## 2. 技術スタック

### デュアルエンジン構成

| 層 | 技術 | 役割 |
|----|------|------|
| **Go推論エンジン** | Go 1.26 | 6ノードパイプライン（レイテンシ8ms、バイナリ6.1MB） |
| **TypeScriptフォールバック** | Node.js | Go障害時の即時フォールバック（同一ロジック） |
| **フロントエンド** | Next.js 15 + React 19 | スタッフPC画面 + 選手モバイルPWA |
| **データキャッシュ** | React Query v5 | staleTime 30秒、ページ遷移時の再fetch排除 |
| **データベース** | Supabase PostgreSQL | RLS + pgvector + 55マイグレーション |
| **AI** | Gemini 2.0 Flash | テキスト整形のみ（判定には不使用） |
| **決済** | Stripe | サブスクリプション + Webhook |
| **CI/CD** | GitHub Actions + Vercel | 自動テスト → 自動デプロイ |

### Go推論エンジンのパフォーマンス

| 指標 | Go | TypeScript | 改善率 |
|------|-----|-----------|--------|
| 推論レイテンシ | 8ms | ~200ms | 25x |
| バイナリサイズ | 6.1MB | ~140MB | 23x |
| メモリ使用量 | 0.25MB | ~150MB | 600x |

---

## 3. システム構成図

```
┌─────────────────────────────────────────────────────────────┐
│  ユーザー（ブラウザ / スマホ）                                │
│  選手 → /home（モバイルPWA）  スタッフ → /dashboard（PC）   │
└──────────────┬──────────────────────────────┬────────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────────────────────────────────────────┐
│  Next.js アプリケーション（Vercel）                           │
│  ├ 61 APIエンドポイント                                      │
│  ├ React Query キャッシュ                                    │
│  └ middleware.ts（JWT検証 + セキュリティヘッダー）            │
├──────────────────────────────────────────────────────────────┤
│  推論エンジン（デュアル構成）                                 │
│  ┌────────────────┐  ┌─────────────────────┐                │
│  │ Go サービス     │←→│ TypeScript          │                │
│  │ POST /v6/infer │  │ フォールバック       │                │
│  │ 8ms, 6.1MB     │  │ Go障害時に自動切替   │                │
│  └────────────────┘  └─────────────────────┘                │
├──────────────────────────────────────────────────────────────┤
│  Supabase（DB + Auth + RLS + Edge Functions）                │
│  55マイグレーション / 51テーブル / 全RLS有効                  │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. ユーザーと権限

| ロール | できること |
|--------|-----------|
| **master** | 全機能 + スタッフ管理 + チーム管理 + 請求管理 |
| **AT / PT / S&C** | 全選手の閲覧・評価・SOAP・リハビリ・ロック操作 |
| **選手（athlete）** | 自分のデータの閲覧・チェックイン入力のみ |

**RLS**: `get_my_org_id()`（SECURITY DEFINER）で組織分離。選手は `user_id = auth.uid()` のみ。

---

## 5. 画面一覧

### スタッフ画面（PC）— 4アクションハブ

| ハブ | URL | 含まれる機能 |
|------|-----|------------|
| **チーム** | `/dashboard` | KPI、アラート、コンディショントレンド、カレンダー |
| **選手** | `/athletes` | 選手詳細ダッシュボード、アセスメント、リハビリ、SOAP |
| **計画** | `/training` | トレーニングメニュー生成・承認、What-Ifシミュレーション |
| **Analytics** | `/reports` | チーム・個人レポート生成 |

ユーティリティ: コミュニティ / 設定 / 管理（masterのみ: スタッフ・チーム・請求）

### 選手画面（モバイルPWA）— 5タブ

| タブ | URL | 内容 |
|------|-----|------|
| **ホーム** | `/home` | GlowingCore + AIサマリ + MetricLabel + コンパス |
| **入力** | `/checkin` | Bio-Swipe → スライダーフォーム（順序ランダム化） |
| **履歴** | `/history` | トレンドチャート + 30日カレンダーヒートマップ |
| **スキャン** | `/scanner` | カメラ解析（スマートスキャナー） |
| **マイ** | `/profile` | プロフィール、データ蓄積、ログアウト |

### 指標の二層表現（MetricLabel）

| 指標 | 選手向け | スタッフ向け |
|------|---------|-------------|
| コンディション | 「良好」🟢 78/100 | コンディションスコア 78.0 |
| 負荷バランス | 「最適」🟢 | ACWR 1.12 |
| 体力の蓄積 | 「標準」🟡 65 | フィットネス（42日平均）65.0 |
| 回復度 | 「58%」🟢 | 疲労度（7日平均）42.0 |
| 痛みの強さ | 😟 6/10 | 痛み（NRS）6/10 |
| 自律神経 | 「良好」🟢 +5 | 心拍変動（基準値差）+5.0 |

---

## 6. 推論エンジン

### 6ノードパイプライン

```
入力 → [Node0:正規化] → [Node1:洗浄] → [Node2:特徴量]
     → [Node3:推論] → [Node4:判定] → [Node5:表示]
     → 品質ゲート → 傾向検出 → 出力
```

| ノード | 処理 | 特記事項 |
|--------|------|---------|
| **Node 0** | 入力値クランプ、リスク乗数計算 | 純関数 |
| **Node 1** | 外れ値検出、LOCF/指数減衰補完 | 段階的Z-Score重み（14日:50%, 22日:75%, 28日:100%） |
| **Node 2** | EWMA-ACWR、単調性、複合Readiness | ODE/EKF/FFM排除済み（Level 5エビデンス不足） |
| **Node 3** | ロジスティックリスクスコア、ベイズ更新 | 特徴量重み: ACWR 2.5, ウェルネス 2.0, 傷害歴 1.5, 単調性 0.3 |
| **Node 4** | P1-P5優先階層判定 | 次章で詳述 |
| **Node 5** | FIFA 11+推奨、NLGサマリー、免責条項 | テンプレートベース（確定的） |

### 排除したモデル（エビデンス監査の結果）

| モデル | 排除理由 | 代替 |
|--------|---------|------|
| ODE損傷エンジン | Level 5（動物実験のみ） | EWMA-ACWR + GPS外部負荷 |
| EKFデカップリング | 学術論文ゼロ、偽陽性30% | ウェルネスZ-Score持続悪化パターン |
| Banister FFM | 統計的欠陥（Marchal 2025） | 複合Readinessスコア |
| Φ構造的脆弱性 | Level 5（FEMベース） | 傷害歴リスク乗数 |
| Monotony単独トリガー | Level 2a否定的 | 補助情報（重み0.3） |

---

## 7. 判定ロジック（P1-P5）

| 優先度 | 判定色 | 条件 | エビデンス |
|--------|--------|------|-----------|
| **P1** | RED | Pain≥8（NSAID時スキップ）/ HR Z>2.0 / 発熱・ワクチン後 / Sleep≤2+Fatigue≥8 | Level 2a consensus |
| **P2** | RED/ORANGE | ACWR>1.5（13-17歳:1.3）**かつ**ウェルネス悪化2項目以上→RED / ACWRのみ→ORANGE | Qin 2025 + Thorpe 2017 |
| **P3** | YELLOW | ACWR正常(0.8-1.3)だがZ≤-1.5が3項目以上 | Palacios-Ceña 2021 + Saw 2016 |
| **P4** | YELLOW | Z≤-1.5が2項目以上（試合日・順化・減量で緩和） | Selye GAS理論 |
| **P4b** | YELLOW | sRPE<4 + 睡眠Z≤-1.5 + 疲労Z≥1.5 | アロスタティック負荷 |
| **P5** | GREEN | 上記非該当 | フォールバック |

### コンテキスト・オーバーライド

| フラグ | 効果 |
|--------|------|
| 試合日 | P4閾値緩和 |
| 順化期間 | HR P1ミュート、P4緩和 |
| 減量期 | P4疲労警告抑制 |
| NSAID服用 | Pain NRS P1スキップ |
| コンタクト×外傷性 | Pain閾値引き上げ |

---

## 8. 新機能

### 8-1. データ品質ゲート

| 条件 | 動作 |
|------|------|
| qualityScore < 0.6 かつ GREEN | → YELLOW + 「専門家の確認を推奨」|
| 信頼度 Low かつ GREEN | → YELLOW + 「要確認: 自動判定を抑制」|
| RED / ORANGE | 上書きしない（より深刻な判定を優先） |

### 8-2. 傾向通知（Trend Notice）

直近3日間の線形回帰で、3日後に閾値を超える傾向を検出。

| 監視指標 | 方向 | 閾値 |
|---------|------|------|
| ACWR | 上昇 | 1.5 |
| 単調性 | 上昇 | 2.0 |
| 睡眠Z-Score | 下降 | -1.5 |
| 疲労Z-Score | 下降 | -1.5 |

**判定色は変えない**。通知として `trend_notices` 配列に追加するのみ。

### 8-3. 段階的Z-Score（14日の崖解消）

| 日数 | Z-Score重み |
|------|------------|
| 0-13日 | 0%（計算しない） |
| 14-21日 | 50% |
| 22-27日 | 75% |
| 28日以上 | 100% |

### 8-4. 信頼度レベル

| レベル | 条件 |
|--------|------|
| **high** | フルモード + qualityScore ≥ 0.8 |
| **medium** | ラーニングモード or qualityScore 0.6-0.8 |
| **low** | セーフティモード or qualityScore < 0.6 |

---

## 9. データベース設計

### 主要テーブル（55マイグレーション、51テーブル）

| カテゴリ | テーブル | 説明 |
|---------|---------|------|
| **組織** | organizations, teams, staff, athletes | マルチテナント基盤 |
| **日次データ** | daily_metrics, session_logs, coaching_history | チェックイン + セッション + AI履歴 |
| **GPS** | gps_session_loads | Catapult/STATSports連携 |
| **評価** | assessments, assessment_nodes, soap_notes | CAT + SOAP |
| **リハビリ** | rehab_programs, rehab_phase_gates, athlete_locks | RTP + ロック |
| **推論** | inference_trace_logs, athlete_condition_cache | 監査証跡 + キャッシュ |
| **課金** | subscriptions, stripe_events, dunning_schedules | Stripe連携 |
| **ビュー** | v_wellness_consecutive_decline | P3判定用ウェルネス悪化追跡 |

### 最新マイグレーション

| ファイル | 内容 |
|---------|------|
| 20260401000001 | coaching_history（AIコーチング履歴） |
| 20260331000003 | v_wellness_consecutive_decline（ウェルネス悪化ビュー） |
| 20260331000002 | gps_session_loads（GPS外部負荷） |
| 20260331000001 | athletes.user_id（選手-認証紐付け） |
| 20260330000006 | daily_metrics.pain_type（痛みタイプ分類） |
| 20260330000005 | session_logs（複数セッション対応） |
| 20260330000004 | athlete_condition_cache.last_calibration_at |
| 20260330000003 | daily_metrics.menstrual_phase（月経周期） |
| 20260330000002 | athlete_condition_cache.baseline_reset_at |
| 20260330000001 | daily_metrics.medication_nsaid_24h |

---

## 10. API一覧（61エンドポイント）

### コア機能

| メソッド | URL | 説明 |
|---------|-----|------|
| POST | `/api/checkin` | 日次チェックイン |
| GET | `/api/conditioning/{athleteId}` | コンディションスコア |
| GET | `/api/athlete/home-data/{athleteId}` | モバイルホーム統合データ |
| POST | `/api/pipeline` | v6推論パイプライン実行 |
| POST | `/api/pipeline/baseline-reset` | ベースラインリセット |
| POST | `/api/pipeline/team-anomaly` | チーム全体異常検知 |

### 評価・リハビリ

| メソッド | URL | 説明 |
|---------|-----|------|
| POST | `/api/assessment/start` | アセスメント開始 |
| POST | `/api/assessment/answer` | CAT回答送信 |
| GET/POST | `/api/soap` | SOAPノートCRUD（スタッフ名join） |
| POST | `/api/soap/generate` | AI SOAP生成 |
| POST | `/api/rehab/programs/{id}/gate` | フェーズゲートチェック |

### シミュレーション

| メソッド | URL | 説明 |
|---------|-----|------|
| POST | `/api/counterfactual/evaluate` | What-Ifシミュレーション |
| POST | `/api/dbn/simulate` | 動的ベイジアンネットワーク |
| POST | `/api/rts/predict` | 復帰予測 |

### 管理

| メソッド | URL | 説明 |
|---------|-----|------|
| GET/POST | `/api/admin/staff` | スタッフ管理 |
| GET/POST | `/api/admin/teams` | チーム管理 |
| GET/POST | `/api/locks` | 活動制限ロック |
| GET/POST | `/api/reports/athlete` | 個人レポート |
| GET/POST | `/api/reports/team` | チームレポート |

---

## 11. 認証・セキュリティ

### 認証フロー

```
/login → Email/Password or Google OAuth or Magic Link
       → Supabase Auth → Session Cookie
       → athletes.user_id マッチ → /home（選手）
       → staff テーブルにレコード → /dashboard（スタッフ）
```

### セキュリティ対策

| 対策 | 状態 |
|------|------|
| RLS（51テーブル全て） | ✅ org_id分離 + user_id分離 |
| CSP（unsafe-eval除去済） | ✅ |
| HSTS（max-age=63072000） | ✅ |
| 入力バリデーション | ✅ validateUUID, sanitizeString |
| Geminiガードレール | ✅ 3層（サニタイズ→有害検出→出力検証） |
| レートリミット | ✅ Gemini 20req/min, S2S 100req/hour |
| npm脆弱性 | ✅ 本番影響ゼロ（残り7件はビルド/テスト環境のみ） |

---

## 12. 外部サービス連携

| サービス | 用途 | 認証 |
|---------|------|------|
| Supabase | DB + 認証 | Service Role Key / Anon Key |
| Gemini 2.0 Flash | テキスト整形（判定不使用） | API Key |
| Stripe | サブスクリプション | Secret Key + Webhook Secret |
| Google Calendar | スケジュール同期 | OAuth 2.0 |
| Slack | アラート通知 | Webhook |
| Sentry | エラー監視 | DSN Token |

---

## 13. 環境変数

### 必須

| 変数名 | 説明 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://lwoadgkwywhyixgddkow.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase公開キー |
| `SUPABASE_SERVICE_ROLE_KEY` | バックエンド専用 |
| `SUPABASE_PROJECT_REF` | 20文字のプロジェクトID |
| `SUPABASE_ACCESS_TOKEN` | Management APIトークン |
| `GEMINI_API_KEY` | Gemini APIキー |
| `STRIPE_SECRET_KEY` | Stripe秘密鍵 |

### 任意

| 変数名 | 説明 |
|--------|------|
| `NEXT_PUBLIC_SITE_URL` | 本番URL（デフォルト: https://hachi-riskon.com） |
| `GO_ENGINE_URL` | Go推論エンジンURL（Shadow Mode用） |
| `GO_ENGINE_ENABLED` | Go推論エンジン有効化フラグ |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Calendar OAuth |
| `SLACK_WEBHOOK_URL` | Slack通知 |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry エラー監視 |

---

## 付録: Go推論エンジン（pace-inference/）

```
pace-inference/                 ← 28ファイル、2,534行
  cmd/server/main.go           ← HTTP サーバー（graceful shutdown）
  internal/
    domain/                    ← 型定義（15 struct, 5 enum）
    math/                      ← EWMA, ACWR, Z-Score, sigmoid, decay, Wilson
    pipeline/                  ← 6ノード + 品質ゲート + 傾向検出
    config/                    ← YAML設定（閾値ランタイム変更可能）
    handler/                   ← POST /v6/infer + GET /health
  Dockerfile                   ← scratch base, ~10MB
```

### APIエンドポイント

```
POST /v6/infer
  入力: { athlete_context, daily_input, history[] }
  出力: { decision, feature_vector, inference, data_quality,
          confidence_level, trend_notices[], expert_review_required }

GET /health
  出力: { status: "ok", version: "v6.0-go", memory_mb }
```

### ロールアウト計画

```
Shadow Mode（1週間）→ カナリア10%（1週間）→ 50% → 100%
自動ロールバック: エラー率>5% or レイテンシp99>3秒
TypeScript版は6ヶ月間フォールバックとして維持
```
