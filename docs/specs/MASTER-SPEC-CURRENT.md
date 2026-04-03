# PACE Platform 統合マスター仕様書
## Performance Analytics & Conditioning Engine

**バージョン**: v6.2
**最終更新**: 2026-04-03
**対象競技**: サッカー / 野球 / バスケットボール / ラグビー / その他（5競技対応）
**URL**: https://hachi-riskon.com
**エビデンス基準**: Oxford CEBM Level 2 以上のみ判定ロジックに採用

---

## 変更履歴

| 日付 | バージョン | 変更サマリー |
|------|-----------|------------|
| 2026-04-01 | v6.1 | Go推論エンジン + 品質ゲート + 傾向通知 + 専門家委譲の統合仕様 |
| 2026-04-03 | v6.2 | pm-plan-v6.md + execution-plan-multi-sport.md を統合。マルチスポーツ拡張（5競技SportProfile）、MVP必須機能からODE/EKF/Python完全排除、競技別ノード最適化、バックログ全面再構築。旧仕様書は docs/specs/completed/ に移動 |

---

## 目次

1. [プロダクト概要](#1-プロダクト概要)
2. [技術スタック](#2-技術スタック)
3. [システム構成図](#3-システム構成図)
4. [ユーザーと権限](#4-ユーザーと権限)
5. [画面一覧](#5-画面一覧)
6. [競技別設計（Sport Profile）](#6-競技別設計sport-profile)
7. [推論エンジン](#7-推論エンジン)
8. [判定ロジック（P1-P5）](#8-判定ロジックp1-p5)
9. [新機能：品質ゲート・傾向通知・専門家委譲](#9-新機能)
10. [データベース設計](#10-データベース設計)
11. [API一覧](#11-api一覧)
12. [認証・セキュリティ](#12-認証セキュリティ)
13. [外部サービス連携](#13-外部サービス連携)
14. [環境変数](#14-環境変数)
15. [MVPスコープ](#15-mvpスコープ)
16. [KPIツリー](#16-kpiツリー)
17. [優先順位付きバックログ](#17-優先順位付きバックログ)
18. [実行計画（Sprint詳細）](#18-実行計画sprint詳細)
19. [競技別UI/UX差分仕様](#19-競技別uiux差分仕様)
20. [リスク分析](#20-リスク分析)

---

## 1. プロダクト概要

### PACEとは

PACEは、スポーツチームのアスレティックトレーナー（AT）やコーチが、選手のコンディションを科学的に管理するためのWebアプリケーションです。

選手が毎日入力する「体の調子」データをもとに、AIが「今日トレーニングしても大丈夫か」を4色（緑・黄・橙・赤）で判定します。

### 3つの判定レベル

| レベル | 表示 | 説明 |
|--------|------|------|
| **確定判定** | RED / ORANGE / GREEN | 閾値を明確に超えたケース |
| **傾向通知** | YELLOW + 傾向メッセージ | データが閾値に接近中（判定は変えない） |
| **専門家委譲** | YELLOW + 要確認フラグ | データ品質不足で自動判定を抑制 |

### 設計原則

1. **判定ロジックは100%確定的** -- LLMの出力を判定に使ってはならない
2. **品質問題時は判定しない** -- 専門家に委ねる
3. **傾向は通知するが判定は変えない** -- 接近中を知らせるだけ
4. **エビデンスベース** -- Level 2以上の文献のみ
5. **TypeScript版は削除しない** -- Goがダウンしたら即フォールバック

### 収益モデル

| プラン | 月額 | 内容 |
|--------|------|------|
| Standard | 10万円 | 選手管理・SOAP・基本分析 |
| Pro | 30万円 | Standard + LLM 分析・高度ダッシュボード |
| Pro + CV Addon | 50万円 | Pro + CV 解析 API（50本/月） |
| Enterprise | 60万円 | Pro + CV Addon + 複数チーム管理 |

---

## 2. 技術スタック

### デュアルエンジン構成

| 層 | 技術 | 役割 |
|----|------|------|
| **Go推論エンジン** | Go 1.26 | 6ノードパイプライン（レイテンシ8ms、バイナリ6.1MB） |
| **TypeScriptフォールバック** | Node.js | Go障害時の即時フォールバック（同一ロジック） |
| **フロントエンド** | Next.js 15 + React 19 | スタッフPC画面 + 選手モバイルPWA |
| **状態管理** | Zustand | クライアントサイド状態管理 |
| **データキャッシュ** | React Query v5 | staleTime 30秒、ページ遷移時の再fetch排除 |
| **スタイリング** | Tailwind CSS | ユーティリティファーストCSS |
| **アニメーション** | Framer Motion | UIアニメーション |
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

### スタッフ画面（PC） -- 4アクションハブ

| ハブ | URL | 含まれる機能 |
|------|-----|------------|
| **チーム** | `/dashboard` | KPI、アラート、コンディショントレンド、カレンダー |
| **選手** | `/athletes` | 選手詳細ダッシュボード、アセスメント、リハビリ、SOAP |
| **計画** | `/training` | トレーニングメニュー生成・承認、What-Ifシミュレーション |
| **Analytics** | `/reports` | チーム・個人レポート生成 |

ユーティリティ: コミュニティ / 設定 / 管理（masterのみ: スタッフ・チーム・請求）

### 選手画面（モバイルPWA） -- 5タブ

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
| コンディション | 「良好」 78/100 | コンディションスコア 78.0 |
| 負荷バランス | 「最適」 | ACWR 1.12 |
| 体力の蓄積 | 「標準」 65 | フィットネス（42日平均）65.0 |
| 回復度 | 「58%」 | 疲労度（7日平均）42.0 |
| 痛みの強さ | 6/10 | 痛み（NRS）6/10 |
| 自律神経 | 「良好」 +5 | 心拍変動（基準値差）+5.0 |

---

## 6. 競技別設計（Sport Profile）

### 6.1 サポート競技一覧

チーム登録（setup-wizard）で以下の5競技から選択する。選択結果は `organizations.sport` および `athletes.sport` に保存され、推論パイプラインとUI/UXの両方に適用される。

| ID | 競技 | コンタクト | 主な負荷特性 | GPS連携 |
|----|------|-----------|-------------|---------|
| `soccer` | サッカー | Yes | 有酸素 + 間欠的スプリント + 接触 | Phase 2 |
| `baseball` | 野球 | No | 投球負荷（肩・肘）+ 瞬発系 | なし |
| `basketball` | バスケ | Yes(軽度) | ジャンプ負荷 + 急停止・方向転換 | Phase 2 |
| `rugby` | ラグビー | Yes(高度) | 高衝撃接触 + 有酸素 + パワー | Phase 2 |
| `other` | その他 | 設定可 | 汎用プロファイル | なし |

### 6.2 競技別パラメータプロファイル（SportProfile）

Go: `pace-inference/internal/config/sport_profiles.go`
TS: `pace-platform/lib/engine/v6/config/sport-profiles.ts`

```
type SportProfile struct {
    SportID         string
    IsContactSport  bool
    ACWRRedLine     float64   // P2閾値（成人）
    ACWRYouthFactor float64   // 13-17歳の係数
    MonotonyWeight  float64   // 特徴量重みの調整
    PainThresholdAdjust float64 // コンタクト外傷性痛み閾値調整
    EWMAConfig      EWMAConfig
    FeatureWeights  FeatureWeights
    TissueDefaults  map[string]TissueParams
    RecommendedActions map[string][]string // 優先度別の競技固有推奨アクション
}
```

| パラメータ | soccer | baseball | basketball | rugby | other |
|-----------|--------|----------|-----------|-------|-------|
| ACWRRedLine | 1.5 | 1.3 | 1.4 | 1.5 | 1.5 |
| IsContactSport | true | false | true | true | false |
| PainThresholdAdjust | 1.2 | 1.0 | 1.1 | 1.4 | 1.0 |
| EWMA AcuteSpan | 7 | 7 | 7 | 7 | 7 |
| EWMA ChronicSpan | 28 | 21 | 28 | 28 | 28 |
| FeatureWeights.ACWRExcess | 2.5 | 2.0 | 2.3 | 2.5 | 2.5 |
| FeatureWeights.WellnessDecline | 2.0 | 2.5 | 2.0 | 2.0 | 2.0 |
| FeatureWeights.InjuryHistory | 1.5 | 2.0 | 1.5 | 1.5 | 1.5 |
| FeatureWeights.MonotonyInfo | 0.3 | 0.5 | 0.3 | 0.3 | 0.3 |
| TissueDefaults.metabolic.HalfLifeDays | 2 | 2 | 2 | 2 | 2 |
| TissueDefaults.structural_soft.HalfLifeDays | 7 | 10 | 7 | 5 | 7 |
| TissueDefaults.structural_hard.HalfLifeDays | 21 | 28 | 21 | 14 | 21 |

**エビデンス根拠**:
- サッカー: Qin 2025, Thorpe 2017 -- ACWR 1.5 は Level 2a
- 野球: Fleisig 2022 -- 投球肩は慢性負荷蓄積が長く ChronicSpan 21日、InjuryHistory 重み増
- バスケ: Svilar 2018 -- ジャンプ・着地負荷でACWR閾値やや保守的
- ラグビー: Gabbett 2016 -- 高衝撃コンタクトで構造組織の半減期短縮、痛み閾値引き上げ

### 6.3 ノード別の競技分岐仕様

#### Node 0（Data Ingestion）
- 選手の `sport` から `SportProfile` をロード
- `isContactSport` を `AthleteContext` にセット
- 競技固有の `TissueDefaults` を `tissueHalfLifes` に適用

#### Node 1（Data Cleaning）
- 変更なし（競技非依存）

#### Node 2（Feature Engineering）
- `SportProfile.EWMAConfig` から `AcuteSpan`/`ChronicSpan` を取得
- `SportProfile.FeatureWeights` をリスクスコア計算に使用

#### Node 3（Inference）
- `SportProfile.FeatureWeights` でロジスティック回帰の重みを決定

#### Node 4（Decision）
- `SportProfile.ACWRRedLine` をP2閾値に使用
- `SportProfile.PainThresholdAdjust` でコンタクト外傷性痛みの閾値調整
- `SportProfile.ACWRYouthFactor` で13-17歳補正

#### Node 5（Presentation）
- `SportProfile.RecommendedActions` から競技固有の推奨アクションテンプレートを選択
- 例: 野球「投球数制限プロトコルに従ってください」/ ラグビー「コンタクト練習からの一時的除外を検討」

---

## 7. 推論エンジン

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
| **Node 3** | ロジスティックリスクスコア、ベイズ更新 | 特徴量重み: 競技別SportProfileから取得 |
| **Node 4** | P1-P5優先階層判定 | 競技別ACWR閾値・痛み閾値適用 |
| **Node 5** | FIFA 11+推奨、NLGサマリー、免責条項 | 競技別推奨アクションテンプレート |

### 排除したモデル（エビデンス監査の結果）

| モデル | 排除理由 | 代替 |
|--------|---------|------|
| ODE損傷エンジン | Level 5（動物実験のみ） | EWMA-ACWR + GPS外部負荷 |
| EKFデカップリング | 学術論文ゼロ、偽陽性30% | ウェルネスZ-Score持続悪化パターン |
| Banister FFM | 統計的欠陥（Marchal 2025） | 複合Readinessスコア |
| 構造的脆弱性 | Level 5（FEMベース） | 傷害歴リスク乗数 |
| Monotony単独トリガー | Level 2a否定的 | 補助情報（重み0.3） |
| Pythonマイクロサービス | 不要な複雑性 | Go+TSデュアル構成に統一 |

---

## 8. 判定ロジック（P1-P5）

| 優先度 | 判定色 | 条件 | エビデンス |
|--------|--------|------|-----------|
| **P1** | RED | Pain>=8（NSAID時スキップ）/ HR Z>2.0 / 発熱・ワクチン後 / Sleep<=2+Fatigue>=8 | Level 2a consensus |
| **P2** | RED/ORANGE | ACWR>SportProfile.ACWRRedLine（13-17歳:YouthFactor適用）**かつ**ウェルネス悪化2項目以上→RED / ACWRのみ→ORANGE | Qin 2025 + Thorpe 2017 |
| **P3** | YELLOW | ACWR正常(0.8-1.3)だがZ<=-1.5が3項目以上 | Palacios-Cena 2021 + Saw 2016 |
| **P4** | YELLOW | Z<=-1.5が2項目以上（試合日・順化・減量で緩和） | Selye GAS理論 |
| **P4b** | YELLOW | sRPE<4 + 睡眠Z<=-1.5 + 疲労Z>=1.5 | アロスタティック負荷 |
| **P5** | GREEN | 上記非該当 | フォールバック |

### コンテキスト・オーバーライド

| フラグ | 効果 |
|--------|------|
| 試合日 | P4閾値緩和 |
| 順化期間 | HR P1ミュート、P4緩和 |
| 減量期 | P4疲労警告抑制 |
| NSAID服用 | Pain NRS P1スキップ |
| コンタクト×外傷性 | Pain閾値引き上げ（SportProfile.PainThresholdAdjust適用） |

---

## 9. 新機能

### 9-1. データ品質ゲート

| 条件 | 動作 |
|------|------|
| qualityScore < 0.6 かつ GREEN | → YELLOW + 「専門家の確認を推奨」|
| 信頼度 Low かつ GREEN | → YELLOW + 「要確認: 自動判定を抑制」|
| RED / ORANGE | 上書きしない（より深刻な判定を優先） |

### 9-2. 傾向通知（Trend Notice）

直近3日間の線形回帰で、3日後に閾値を超える傾向を検出。

| 監視指標 | 方向 | 閾値 |
|---------|------|------|
| ACWR | 上昇 | SportProfile.ACWRRedLine |
| 単調性 | 上昇 | 2.0 |
| 睡眠Z-Score | 下降 | -1.5 |
| 疲労Z-Score | 下降 | -1.5 |

**判定色は変えない**。通知として `trend_notices` 配列に追加するのみ。

### 9-3. 段階的Z-Score（14日の崖解消）

| 日数 | Z-Score重み |
|------|------------|
| 0-13日 | 0%（計算しない） |
| 14-21日 | 50% |
| 22-27日 | 75% |
| 28日以上 | 100% |

### 9-4. 信頼度レベル

| レベル | 条件 |
|--------|------|
| **high** | フルモード + qualityScore >= 0.8 |
| **medium** | ラーニングモード or qualityScore 0.6-0.8 |
| **low** | セーフティモード or qualityScore < 0.6 |

---

## 10. データベース設計

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

### v6.2で追加が必要なDBスキーマ変更

| 変更 | 内容 | ステータス |
|------|------|-----------|
| `organizations.sport` カラム追加 | `TEXT NOT NULL DEFAULT 'other' CHECK (sport IN ('soccer','baseball','basketball','rugby','other'))` | **実装予定** |
| `athletes.is_contact_sport` カラム追加 | sportから自動導出する GENERATED ALWAYS AS 式 or トリガー | **実装予定** |
| `inference_trace_logs.sport_profile_applied` カラム追加 | どのSportProfileが適用されたかの記録 | **実装予定** |
| `device_kappa` マスタテーブル作成 | Catapult=0.9, GPS Watch=0.4, 手動入力=0.5 | **実装予定** |

### 最新マイグレーション（実装済み）

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

## 11. API一覧（61エンドポイント）

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

## 12. 認証・セキュリティ

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
| RLS（51テーブル全て） | 実装済み org_id分離 + user_id分離 |
| CSP（unsafe-eval除去済） | 実装済み |
| HSTS（max-age=63072000） | 実装済み |
| 入力バリデーション | 実装済み validateUUID, sanitizeString |
| Geminiガードレール | 実装済み 3層（サニタイズ→有害検出→出力検証） |
| レートリミット | 実装済み Gemini 20req/min, S2S 100req/hour |
| npm脆弱性 | 実装済み 本番影響ゼロ（残り7件はビルド/テスト環境のみ） |

---

## 13. 外部サービス連携

| サービス | 用途 | 認証 |
|---------|------|------|
| Supabase | DB + 認証 | Service Role Key / Anon Key |
| Gemini 2.0 Flash | テキスト整形（判定不使用） | API Key |
| Stripe | サブスクリプション | Secret Key + Webhook Secret |
| Google Calendar | スケジュール同期 | OAuth 2.0 |
| Slack | アラート通知 | Webhook |
| Sentry | エラー監視 | DSN Token |

---

## 14. 環境変数

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

## 15. MVPスコープ

### 15.1 MVP必須機能

| # | 機能 | ビジネス正当性 |
|---|------|---------------|
| M1 | **競技別SportProfileエンジン** (Go + TS) | コア差別化要因。チーム登録時の競技選択に基づき、推論パラメータ・UI表示・推奨アクションを自動最適化 |
| M2 | **Node 0-5 パイプライン基盤** (Go + TSフォールバック) | 全推論のオーケストレーション。Go（8ms）をプライマリ、TS（~200ms）をフォールバック |
| M3 | **P1-P5 優先度階層 + コンテキスト・オーバーライド** | 臨床意思決定の緊急度制御。競技別ACWR閾値・痛み閾値の自動適用 |
| M4 | **inference_trace_logs テーブル + 監査ログ** | 医療領域の説明可能性・法的コンプライアンス |
| M5 | **データ入力 UI（sRPE・CSV・EHR チェックボックス）** | データなしにはモデルが動かない。手動入力 + CSV がMVPインテーク |
| M6 | **MDT コパイロット画面** | スタッフがリスクサマリー・推奨アクションを確認・承認する主要インターフェース |
| M7 | **RLS ポリシー + 法的セーフガード** | マルチテナントセキュリティ + P1-P2推奨の自動実行禁止 |

### 15.2 Phase 2 以降（MVP除外）

| # | 機能 | 除外理由 |
|---|------|---------|
| P2-1 | チーム別閾値オフセット管理 UI | SportProfileのグローバル定数でMVP開始可能 |
| P2-2 | 外部APIコネクタ（Catapult等） | MVPはCSV + 手動入力 |
| P2-3 | GPS外部負荷の競技別正規化 | GPS連携自体がPhase 2 |
| P2-4 | パラメータ手動微調整UI | Day 0はCSVエビデンスの固定値 |
| P2-5 | 競技追加（陸上・水泳等） | 5競技 + otherでMVP十分 |

### 15.3 スコープ外

| # | 機能 | 除外理由 |
|---|------|---------|
| X1 | ODE 損傷エンジン | エビデンス監査でLevel 5。EWMA-ACWRで代替 |
| X2 | EKF デカップリング | 学術論文ゼロ、偽陽性30%。ウェルネスZ-Scoreで代替 |
| X3 | Banister FFM | 統計的欠陥。複合Readinessスコアで代替 |
| X4 | Python マイクロサービス | Go+TSデュアル構成に統一 |
| X5 | MRF 運動連鎖解析 | 実装工数大。Phase 2以降 |
| X6 | 応力集中テンソル | データ未確定。Phase 2以降 |
| X7 | テレヘルス・保険請求・SSO | ADR-003 で廃止決定済み |
| X8 | ネイティブモバイルアプリ | Web-First/PWA 方針 |
| X9 | サンプルエントロピー | 高頻度IMU必要。Phase 3以降 |

---

## 16. KPIツリー

```
PACE v6.2 トップゴール
「スポーツ傷害の発生率を 30% 低減する」
│
├── 獲得 (Acquisition)
│   ├── KPI: 月間新規チーム登録数
│   │   └── 測定: Supabase auth.users + organizations テーブル
│   ├── KPI: MVP トライアル開始率（LP → サインアップ）
│   │   └── 測定: Web アナリティクス (コンバージョン率)
│   ├── KPI: セットアップ完了率（競技選択→選手登録→初回パイプライン実行）
│   │   └── 測定: organizations WHERE sport IS NOT NULL + inference_trace_logs 初回
│   └── KPI: CSV データアップロード完了率（オンボーディング）
│       └── 測定: Node 0 ingestion_success_count / trial_users
│
├── 活性化 (Activation)
│   ├── KPI: 初回パイプライン実行完了率
│   │   └── 測定: inference_trace_logs WHERE pipeline_version = 'v6.2' (初回)
│   ├── KPI: 初回 P2+ アラート受領 → 対応完了率
│   │   └── 測定: trace_logs.review_decision IS NOT NULL / P2+ count
│   ├── KPI: sRPE 入力開始率（選手側）
│   │   └── 測定: daily_metrics records / active_athletes
│   └── KPI: 競技別SportProfile正常適用率
│       └── 測定: inference_trace_logs WHERE sport_profile_applied = true
│
├── エンゲージメント (Engagement)
│   ├── KPI: 週間パイプライン実行回数 / チーム
│   │   └── 測定: inference_trace_logs GROUP BY organization, week
│   ├── KPI: MDT コパイロット画面の DAU / MAU
│   │   └── 測定: アクセスログ (Node 5 presentation access)
│   ├── KPI: 推奨アクション承認率 (ACCEPTED / total reviews)
│   │   └── 測定: trace_logs.review_decision = 'ACCEPTED'
│   ├── KPI: 品質ゲート発火回数（qualityScore < 0.6）
│   │   └── 測定: inference_trace_logs WHERE quality_gate_fired = true
│   ├── KPI: ACWR超過アラート発火回数（競技別閾値ベース）
│   │   └── 測定: trace_logs WHERE priority IN ('P2_MECHANICAL_RISK')
│   └── KPI: 選手 sRPE 入力継続率（7日連続入力率）
│       └── 測定: daily_inputs streak analysis
│
├── リテンション (Retention)
│   ├── KPI: 月次チーム継続率 (M1, M3, M6)
│   │   └── 測定: subscription_status active / total
│   ├── KPI: スタッフ NPS スコア
│   │   └── 測定: アプリ内サーベイ
│   └── KPI: 傷害発生率の前年比変化
│       └── 測定: injury_records year-over-year comparison
│
└── 収益 (Revenue)
    ├── KPI: MRR（月間経常収益）
    │   └── 測定: Stripe / billing テーブル
    ├── KPI: ARPU（チーム当たり平均収益）
    │   └── 測定: MRR / active_organizations
    └── KPI: 競技別チーム数分布
        └── 測定: organizations GROUP BY sport
```

---

## 17. 優先順位付きバックログ

### 凡例

- **担当エージェント**: @05-architect, @04-backend, @03-frontend, @06-data-engineer, @11-qa, @02-ui-ux
- **SP**: ストーリーポイント (フィボナッチ: 1, 2, 3, 5, 8, 13)
- **ステータス**: 実装予定 / 実装済み

### Sprint 1: 競技別基盤 + DB修正（21 SP）

| # | タスク名 | 担当 | SP | 依存 | ステータス |
|---|---------|------|-----|------|-----------|
| 1 | Go: `sport_profiles.go` 作成 -- 5競技のSportProfile定義 | @04-backend | 5 | -- | 実装予定 |
| 2 | Go: `config.go` にSportProfile統合 -- ConfigForSport(sport) | @04-backend | 3 | 1 | 実装予定 |
| 3 | TS: `sport-profiles.ts` 作成 -- Go版と同一値 | @04-backend | 3 | 1 | 実装予定 |
| 4 | TS: `config.ts` にsport引数追加 | @04-backend | 2 | 3 | 実装予定 |
| 5 | DB: `organizations.sport` カラム追加マイグレーション | @06-data-engineer | 2 | -- | 実装予定 |
| 6 | DB: `athletes.is_contact_sport` カラム追加 | @06-data-engineer | 3 | 5 | 実装予定 |
| 7 | API: `onboarding/setup` 修正 -- sport保存バグ修正 | @04-backend | 1 | 5 | 実装予定 |
| 8 | API: `pipeline/route.ts` 修正 -- SportProfile動的取得 | @04-backend | 3 | 3, 5 | 実装予定 |

### Sprint 2: Go/TS ノード競技対応（23 SP）

| # | タスク名 | 担当 | SP | 依存 | ステータス |
|---|---------|------|-----|------|-----------|
| 9 | Go: Node 0 修正 -- SportProfileロード + Config上書き | @04-backend | 3 | 2 | 実装予定 |
| 10 | Go: Node 2 修正 -- 競技別EWMAスパン使用 | @04-backend | 2 | 9 | 実装予定 |
| 11 | Go: Node 3 修正 -- 競技別FeatureWeights使用 | @04-backend | 2 | 9 | 実装予定 |
| 12 | Go: Node 4 修正 -- 競技別ACWR閾値 + PainThreshold | @04-backend | 3 | 9 | 実装予定 |
| 13 | Go: Node 5 修正 -- 競技別推奨アクションテンプレート | @04-backend | 3 | 1, 12 | 実装予定 |
| 14 | TS: パイプライン競技対応 -- Go側と同一ロジック | @04-backend | 5 | 3, 4 | 実装予定 |
| 15 | Go: `pipeline_test.go` 競技別テスト -- 全5競技 x P1-P5 | @11-qa | 5 | 9-13 | 実装予定 |

### Sprint 3: データ入力 + 品質ゲート（19 SP）

| # | タスク名 | 担当 | SP | 依存 | ステータス |
|---|---------|------|-----|------|-----------|
| 16 | DB: `inference_trace_logs` 確認 + RLS + インデックス | @06-data-engineer | 3 | -- | 実装予定 |
| 17 | DB: `device_kappa` マスタテーブル作成 | @06-data-engineer | 2 | -- | 実装予定 |
| 18 | API: `POST /api/pipeline` トレースログ保存の完全化 | @04-backend | 3 | 16 | 実装予定 |
| 19 | Go/TS: 品質ゲート -- qualityScore < 0.6 のGREEN→YELLOW降格 | @04-backend | 3 | 9 | 実装予定 |
| 20 | Go/TS: 傾向通知 -- 3日間線形回帰で閾値接近検出 | @04-backend | 3 | 9 | 実装予定 |
| 21 | RLS実装: Player/Coach/Doctor権限分離 | @06-data-engineer | 5 | 16 | 実装予定 |

### Sprint 4: フロントエンド（データ入力）（13 SP）

| # | タスク名 | 担当 | SP | 依存 | ステータス |
|---|---------|------|-----|------|-----------|
| 22 | FE: sRPE・睡眠品質・ウェルネス入力フォーム（モバイル） | @03-frontend | 5 | -- | 実装予定 |
| 23 | FE: CSVアップロード画面（S&C向け） | @03-frontend | 3 | -- | 実装予定 |
| 24 | FE: EHR既往歴チェックボックス入力画面（AT向け） | @03-frontend | 3 | -- | 実装予定 |
| 25 | FE: セットアップウィザード改修 -- 競技選択UI強化 | @03-frontend | 2 | 7 | 実装予定 |

### Sprint 5: フロントエンド（判定表示 + 競技別UI）（28 SP）

| # | タスク名 | 担当 | SP | 依存 | ステータス |
|---|---------|------|-----|------|-----------|
| 26 | FE: MDTコパイロット画面 -- リスクサマリー・推論トレース・承認 | @03-frontend | 8 | 18 | 実装予定 |
| 27 | FE: P1即時通知（PWA Push）+ P2担当者通知 | @03-frontend | 5 | 12 | 実装予定 |
| 28 | FE: 法的免責事項コンポーネント | @03-frontend | 2 | 26 | 実装予定 |
| 29 | FE: 人間承認フローUI -- P1-P2推奨は有資格スタッフ承認必須 | @03-frontend | 5 | 26, 28 | 実装予定 |
| 30 | FE: 競技別UI最適化 -- ダッシュボード指標表示の競技切替 | @03-frontend | 5 | 8 | 実装予定 |
| 31 | FE: 競技別推奨アクション文言 -- Node 5出力の競技適応表示 | @03-frontend | 3 | 13, 26 | 実装予定 |

### Sprint 6: テスト + i18n（27 SP）

| # | タスク名 | 担当 | SP | 依存 | ステータス |
|---|---------|------|-----|------|-----------|
| 32 | E2E: パイプライン全体実行 -- 全5競技 x 正常系・異常系 | @11-qa | 8 | 14, 18 | 実装予定 |
| 33 | E2E: 競技別P2閾値テスト | @11-qa | 5 | 15 | 実装予定 |
| 34 | E2E: P1アラート発火 → 通知 → 承認フロー | @11-qa | 5 | 27, 29 | 実装予定 |
| 35 | E2E: 品質ゲート降格テスト | @11-qa | 3 | 19 | 実装予定 |
| 36 | パフォーマンステスト: Go < 50ms, TS < 500ms | @11-qa | 3 | 32 | 実装予定 |
| 37 | i18n: 全UIテキスト日本語化 | @03-frontend | 3 | 26-31 | 実装予定 |

### Phase 2（Sprint 7-10）

| # | タスク名 | 担当 | SP | 依存 | ステータス |
|---|---------|------|-----|------|-----------|
| 38 | チーム別閾値オフセット管理画面（+-20%） | @03-frontend | 5 | 21 | 実装予定 |
| 39 | 外部APIコネクタ基盤（Catapult API認証 + データ取込） | @04-backend | 8 | -- | 実装予定 |
| 40 | GPS外部負荷の競技別正規化 | @04-backend | 5 | 39, 1 | 実装予定 |
| 41 | パラメータ手動微調整UI（SportProfileオーバーライド） | @03-frontend | 5 | 1 | 実装予定 |
| 42 | 競技追加プロファイル（陸上・水泳・テニス等） | @04-backend | 3 | 1 | 実装予定 |
| 43 | E2E テスト: GPS連携 + 競技別正規化 | @11-qa | 5 | 40 | 実装予定 |

**MVP合計: 37タスク / 131 SP（6 Sprint）**

---

## 18. 実行計画（Sprint詳細）

### 実装サマリー

| Sprint | タスク数 | SP | 主要成果物 |
|--------|---------|-----|-----------|
| **Sprint 1** | 8 | 21 | SportProfile (Go/TS), DB migration, API bugfix |
| **Sprint 2** | 7 | 23 | Node 0-5 競技対応 (Go/TS), 競技別テスト |
| **Sprint 3** | 6 | 19 | トレースログ, 品質ゲート, RLS |
| **Sprint 4** | 4 | 13 | 入力UI (sRPE, CSV, EHR, セットアップ改修) |
| **Sprint 5** | 6 | 28 | MDTコパイロット, 競技別UI, 通知, 承認フロー |
| **Sprint 6** | 6 | 27 | E2E テスト, パフォーマンス, i18n |
| **合計** | **37** | **131** | |

### 新規作成ファイル: 8

```
pace-inference/internal/config/sport_profiles.go
pace-inference/internal/domain/sport.go
pace-platform/lib/engine/v6/config/sport-profiles.ts
src/lib/basketball/constants.ts
src/lib/baseball/constants.ts
src/lib/rugby/constants.ts
supabase/migrations/XXX_add_sport_to_organizations.sql
pace-platform/tests/unit/sport-profiles.test.ts
```

### 変更ファイル: 16

```
Go Engine (7ファイル)
  pace-inference/internal/config/config.go
  pace-inference/internal/domain/context.go
  pace-inference/internal/pipeline/node0_ingestion.go
  pace-inference/internal/pipeline/node2_feature.go
  pace-inference/internal/pipeline/node3_inference.go
  pace-inference/internal/pipeline/node4_decision.go
  pace-inference/internal/pipeline/node5_presentation.go
TS Engine (6ファイル)
  pace-platform/lib/engine/v6/types.ts
  pace-platform/lib/engine/v6/config.ts
  pace-platform/lib/engine/v6/pipeline.ts
  pace-platform/lib/engine/v6/nodes/node0-ingestion.ts
  pace-platform/lib/engine/v6/nodes/node4-decision.ts
  pace-platform/lib/engine/v6/nodes/node5-presentation.ts
API (2ファイル)
  pace-platform/app/api/onboarding/setup/route.ts
  pace-platform/app/api/pipeline/route.ts
Frontend (1ファイル)
  src/lib/football/constants.ts
```

### 推定変更行数: ~2,500行（テスト含む）

### 推奨着手順序

```
Day 1-2: Sprint 1 (Task 1-1 → 1-3 → 1-4 → 1-5 並行、1-6 → 1-7 → 1-8 並行)
Day 3-5: Sprint 2 (Task 2-1 → 2-2~2-5 並行 → 2-6 → 2-7)
Day 5-7: Sprint 3 (Sprint 2 と部分的に並行可)
Day 8-9: Sprint 4 (フロントエンド入力)
Day 10-12: Sprint 5 (フロントエンド判定表示)
Day 13-14: Sprint 6 (テスト + i18n)
```

**クリティカルパス**: Sprint 1 (Task 1) → Sprint 2 (Task 9) → Sprint 5 (Task 26) → Sprint 6 (Task 32)

### 依存関係グラフ

```
Sprint 1 (基盤)
├── Task 1: Go sport_profiles.go
│   ├── Task 2: Go config.go 統合 ───┐
│   └── Task 3: TS sport-profiles.ts │
│       └── Task 4: TS config.ts ────┤
├── Task 5: DB migration ────────────┤
│   ├── Task 7: onboarding API fix   │
│   └── Task 8: pipeline route fix ──┘
│
Sprint 2 (ノード対応) ← Sprint 1 全完了が前提
├── Task 9: Go Node 0 (SportProfile ロード)
│   ├── Task 10: Go Node 2 (EWMA)
│   ├── Task 11: Go Node 3 (FeatureWeights)
│   ├── Task 12: Go Node 4 (ACWR閾値 + Pain)
│   └── Task 13: Go Node 5 (推奨アクション)
├── Task 14: TS パイプライン全体
└── Task 15: テスト ← 9-14 全完了

Sprint 3 (データ層) ← Sprint 2 並行可
Sprint 4-5 (フロントエンド) ← Sprint 2 完了後
Sprint 6 (テスト) ← Sprint 5 完了後
```

---

## 19. 競技別UI/UX差分仕様

### 19.1 ダッシュボード指標表示

| 指標 | soccer | baseball | basketball | rugby | other |
|------|--------|----------|-----------|-------|-------|
| 主要負荷指標 | ACWR + スプリント距離 | ACWR + 投球数 | ACWR + ジャンプ回数 | ACWR + 衝撃G | ACWR |
| 痛み表示 | 標準 NRS | 肩/肘 NRS 強調 | 膝/足首 NRS 強調 | 頭部/頸部 NRS 強調 | 標準 NRS |
| 推奨アクション例 | 「スプリント量を制限」 | 「投球数制限プロトコル」 | 「ジャンプ系ドリル制限」 | 「コンタクト練習除外」 | 「負荷軽減」 |

### 19.2 選手入力フォーム

| 項目 | soccer | baseball | basketball | rugby |
|------|--------|----------|-----------|-------|
| 追加入力項目 | -- | 投球数（任意） | -- | 衝撃回数（任意） |
| 痛み部位プリセット | 下肢中心 | 肩・肘・腰 | 膝・足首・腰 | 全身+頭部 |

### 19.3 レポート

| セクション | 競技別対応 |
|-----------|-----------|
| リスクサマリー | 競技名 + 適用されたACWR閾値を明記 |
| 推奨アクション | SportProfile.RecommendedActions から生成 |
| 傾向通知 | 「(競技名)の標準的な負荷パターンと比較して...」の文脈付与 |

---

## 20. リスク分析

### 20.1 既存サッカーロジックのリグレッション: 低リスク

| 保証策 | 内容 |
|--------|------|
| デフォルトフォールバック | `sportProfile` 未指定時は `DEFAULT_PIPELINE_CONFIG` をそのまま使用 |
| soccer Profile の値 | 現行 `DefaultConfig()` と完全一致する値を設定 |
| ゴールデンテスト | 「sport='soccer'の出力 === sport未指定の出力」をCIで検証 |

### 20.2 Go/TS 間の値不一致: 中リスク

| 緩和策 | 内容 |
|--------|------|
| スナップショットテスト | 5競技 x 同一入力 → Go/TS の decision/priority/ACWR が一致するか CI 検証 |
| JSON 外部化（Phase 2） | パラメータ値を JSON に外部化し、Go embed + TS import で同一ソース化 |

### 20.3 野球投手の設計複雑度: 中-高リスク

| 項目 | 対応 |
|------|------|
| MVP では投球数 ACWR なし | sRPE ベースの通常 ACWR のみ。`ACWRRedLine=1.3` の保守的閾値 |
| 投手固有の DailyInput 拡張 | Phase 2 で `pitchingLoad` フィールド追加 |
| 先発 vs 中継ぎ分岐 | Phase 2。MVP ではポジション（SP/RP/CP）による UI 差分のみ |

### 20.4 エビデンス不足パラメータ

| パラメータ | Level | フォールバック |
|-----------|-------|--------------|
| バスケ ACWR 1.4 | 3 (Svilar 2018) | 1.5 (保守的) |
| 野球 ChronicSpan 21日 | 3-4 (Fleisig 2022) | 28日 (標準) |
| ラグビー structural_soft 半減期 5日 | 4-5 | 7日 (標準) |
| バスケ Monotony 2.5 | 4-5 | 2.0 (標準) |

### 20.5 マイグレーション（既存ユーザー影響ゼロ）

1. `organizations.sport` に `DEFAULT 'other'` → 既存チームは自動的に `other` プロファイル適用
2. `other` プロファイル = 現行 `DefaultConfig()` と同一値 → 推論結果に変化なし
3. UI は `sport === 'other'` の場合、現行サッカーUIと同一表示
4. 既存ユーザーはダッシュボード設定画面で sport を変更可能（Sprint 5）

---

## 付録A: Go推論エンジン（pace-inference/）

```
pace-inference/                 ← 29ファイル
  cmd/server/main.go           ← HTTP サーバー（graceful shutdown）
  internal/
    domain/                    ← 型定義（15 struct, 5 enum）
      context.go               ← AthleteContext（Sport, IsContactSport）
      types.go                 ← InferenceDecision, Priority 等
      sport.go                 ← 【新規予定】SportID 列挙型
    math/                      ← EWMA, ACWR, Z-Score, sigmoid, decay, Wilson
    pipeline/                  ← 6ノード + 品質ゲート + 傾向検出
    config/                    ← YAML設定（閾値ランタイム変更可能）
      config.go                ← ConfigForSport(sport) に変更予定
      sport_profiles.go        ← 【新規予定】5競技のSportProfile定義
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

---

## 付録B: TSフォールバック（pace-platform/lib/engine/v6/）

```
pace-platform/lib/engine/v6/
  types.ts                      ← AthleteContext（sport, isContactSport）
  config.ts                     ← configForSport(sport) に変更予定
  config/
    sport-profiles.ts           ← 【新規予定】5競技のSportProfile定義
  pipeline.ts                   ← 競技別Config適用予定
  gateway.ts                    ← Go/TSルーティング
  nodes/
    node0-ingestion.ts
    node1-cleaning.ts
    node2-feature-engineering.ts
    node3-inference.ts
    node4-decision.ts
    node5-presentation.ts
  adapters/
    conditioning-adapter.ts
    bayes-adapter.ts
    index.ts
  index.ts
```

**重要: Go/TS間でSportProfileの値は完全一致させること。テストで値の一致を検証する。**

---

## 付録C: 競技別定数ファイル（src/lib/）

### 実装済み
- `src/lib/football/constants.ts` -- サッカー定数

### 実装予定
- `src/lib/basketball/constants.ts` -- バスケットボール定数（ACTIVITY_MAP, POSITION_CONFIG, sRPEラベル, 質問項目, GAME_DAY処方）
- `src/lib/baseball/constants.ts` -- 野球定数（投手/野手別ACTIVITY_MAP, POSITION_CONFIG, sRPEラベル, 質問項目, Pitch Smartガイドライン, GAME_DAY処方）
- `src/lib/rugby/constants.ts` -- ラグビー定数

---

## 付録D: 既存コードベースの状態（v6.2時点）

| 項目 | 状態 | 備考 |
|------|------|------|
| `sport_profiles.go` | **未作成** | `config/` に `config.go` のみ |
| `sport-profiles.ts` | **未作成** | `config.ts` にフラット構造 |
| `basketball/constants.ts` | **未作成** | `src/lib/` にサッカーのみ |
| `baseball/constants.ts` | **未作成** | 同上 |
| `organizations.sport` カラム | **存在しない** | athletes.sport のみ |
| onboarding API の sport 保存 | **BUG**: org に未保存 | athletes にのみ保存 |
| Go Node 0-5 の sport 分岐 | **なし** | 全ノード競技非依存 |
| TS Node 0-5 の sport 分岐 | **なし** | 同上 |
| `AthleteContext.sport` | **string型** | 型制限なし |

---

## 付録E: ユーザーストーリーマップ

### アクター定義

| アクター | 略称 | 説明 |
|---------|------|------|
| アスレティックトレーナー (AT) | スタッフ | 日常のコンディション管理・傷害予防 |
| 理学療法士 (PT) | スタッフ | リハビリ計画・運動連鎖評価 |
| ドクター | スタッフ | 臨床判断・P1/P2 承認権限 |
| S&C コーチ | スタッフ | トレーニング負荷管理・パフォーマンス最適化 |
| 選手 | 選手 | 自己管理・主観データ入力 |

### 主要ストーリー

| ゴール | ユーザーストーリー | 優先度 | フェーズ |
|--------|-------------------|--------|---------|
| **競技別最適化** | ATとして、初回セットアップで競技を選択し、推論パラメータが自動最適化されてほしい | Must | MVP |
| **傷害リスク検知** | ATとして、ACWR・コンディションスコア・Z-Scoreをダッシュボードで確認し、閾値超過前に介入したい | Must | MVP |
| **パイプライン基盤** | スタッフとして、Go推論エンジン障害時にTSフォールバックが自動で機能してほしい | Must | MVP |
| **臨床意思決定** | ドクターとして、P1(Critical)アラートを即時通知で受け取り、1分以内に確認したい | Must | MVP |
| **データ入力** | 選手として、sRPE・睡眠品質をモバイル画面で簡単に入力したい | Must | MVP |
| **品質ゲート** | ATとして、データ品質が低い場合にGREEN判定が自動でYELLOW+専門家確認に降格されてほしい | Must | MVP |

---

## 付録F: 仕様書統合履歴

本書は以下の仕様書を統合した結果物です。旧仕様書は `docs/specs/completed/` に移動済みです。

| 統合元ファイル | 統合先セクション |
|---------------|----------------|
| MASTER-SPEC-CURRENT.md (v6.1) | セクション 1-14, 付録A |
| pm-plan-v6.md (v6.2) | セクション 6, 15-17, 19-20, 付録E |
| execution-plan-multi-sport.md | セクション 18, 付録B-D |
