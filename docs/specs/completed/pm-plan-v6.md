# PACE v6.2 プロダクトマネジメント計画書

- **作成日**: 2026-03-25
- **最終更新**: 2026-04-03
- **ステータス**: v6.2 改訂版（競技別設計の全面再構築）
- **対象**: PACE Platform v6.2 — Go推論エンジン + TSフォールバック + 競技別パイプライン構成
- **前提文書**: MASTER-SPEC-CURRENT.md (v6.1)

### 変更履歴

| 日付 | 変更サマリー |
|------|------------|
| 2026-03-25 | v6.0 初版作成 |
| 2026-04-03 | v6.1 改訂: ODE/EKF/FFM排除整合、競技別ノード最適化追加、DB不備修正、Python排除 |
| 2026-04-03 | v6.2 改訂: (1) MVP必須機能からODE/EKF/Pythonを完全削除（v6.1で監査結果を書いたがMVP一覧が未修正だった） (2) 競技別SportProfile設計を全ノードに貫通 (3) チーム登録→競技選択→UI/UX競技最適化のEnd-to-Endフロー設計 (4) Go/TSの競技別configファイル分離 (5) KPIツリーからPython/ODE/EKF依存指標を排除 (6) バックログを全面再構築 |

---

## 0. 設計監査結果（v6.1 からの追加修正事項）

### v6.2 で修正した重大な不整合

v6.1 では監査結果（セクション0）で問題を記述したにもかかわらず、**MVPスコープ（セクション2.1）・バックログ（セクション4）・KPIツリー（セクション3）に旧設計が残存**していた。v6.2 で完全に修正した。

| # | 問題 | 深刻度 | 修正内容 |
|---|------|--------|---------|
| BUG-7 | **MVP必須機能M1/M2/M10が残存**: 「Damage-Remodeling ODE」「EKFデカップリング」「Pythonマイクロサービス基盤」がMVP一覧に残っていた | Critical | M1/M2/M10を完全削除。MVP必須機能を7項目に再定義 |
| BUG-8 | **バックログのPythonタスク残存**: #7-#12, #33-#34がPython依存タスク、#8-#11がODE/EKF実装タスク | Critical | 全Python/ODE/EKFタスクを削除。バックログを全面再構築 |
| BUG-9 | **KPI指標がODE/EKF依存**: 「D(t) > 0.8*D_crit」「EKFデカップリング検出回数」がKPIに残存 | High | ACWR/ウェルネス/品質ゲートベースの指標に差し替え |
| BUG-10 | **競技別設計が宣言のみ**: 「SportProfile追加」と書いたが、具体的なノード別の競技分岐設計がなかった | High | 全6ノードの競技別動作仕様を詳細定義 |
| BUG-11 | **onboarding/setupでorganizations.sportが未保存**: APIコードを確認したところ、organizations INSERTにsportカラムが渡されていない | High | onboarding API修正タスクをバックログに追加 |
| BUG-12 | **UI/UXに競技別最適化の設計なし**: チーム登録で競技を選ぶがその後のUIが全競技同一 | Medium | 競技別UI差分仕様を追加 |

---

## 1. 競技別設計（Sport Profile）

### 1.1 サポート競技一覧

チーム登録（setup-wizard）で以下の5競技から選択する。選択結果は `organizations.sport` および `athletes.sport` に保存され、推論パイプラインとUI/UXの両方に適用される。

| ID | 競技 | コンタクト | 主な負荷特性 | GPS連携 |
|----|------|-----------|-------------|---------|
| `soccer` | サッカー | Yes | 有酸素 + 間欠的スプリント + 接触 | Phase 2 |
| `baseball` | 野球 | No | 投球負荷（肩・肘）+ 瞬発系 | なし |
| `basketball` | バスケ | Yes(軽度) | ジャンプ負荷 + 急停止・方向転換 | Phase 2 |
| `rugby` | ラグビー | Yes(高度) | 高衝撃接触 + 有酸素 + パワー | Phase 2 |
| `other` | その他 | 設定可 | 汎用プロファイル | なし |

### 1.2 競技別パラメータプロファイル（SportProfile）

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
- サッカー: Qin 2025, Thorpe 2017 — ACWR 1.5 は Level 2a
- 野球: Fleisig 2022 — 投球肩は慢性負荷蓄積が長く ChronicSpan 21日、InjuryHistory 重み増
- バスケ: Svilar 2018 — ジャンプ・着地負荷でACWR閾値やや保守的
- ラグビー: Gabbett 2016 — 高衝撃コンタクトで構造組織の半減期短縮、痛み閾値引き上げ

### 1.3 ノード別の競技分岐仕様

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

## 2. ユーザーストーリーマップ

### アクター定義

| アクター | 略称 | 説明 |
|---------|------|------|
| アスレティックトレーナー (AT) | スタッフ | 日常のコンディション管理・傷害予防 |
| 理学療法士 (PT) | スタッフ | リハビリ計画・運動連鎖評価 |
| ドクター | スタッフ | 臨床判断・P1/P2 承認権限 |
| S&C コーチ | スタッフ | トレーニング負荷管理・パフォーマンス最適化 |
| 選手 | 選手 | 自己管理・主観データ入力 |

### ストーリーマップ

| ゴール | エピック | ユーザーストーリー | 優先度 | フェーズ |
|--------|---------|-------------------|--------|---------|
| **競技別最適化** | E0: 競技選択→推論最適化 | AT として、初回セットアップで競技を選択し、その競技に最適化された推論パラメータ（ACWR閾値・特徴量重み・推奨アクション）が自動適用されてほしい | Must | MVP |
| | | S&C として、野球チームでは投球負荷に重みが置かれ、サッカーチームではスプリント負荷に重みが置かれるなど、競技特性に合った判定を受けたい | Must | MVP |
| | | AT として、コンタクトスポーツ（サッカー・ラグビー）では外傷性疼痛の閾値が競技の衝撃度に応じて調整されてほしい | Must | MVP |
| | | AT として、ダッシュボードのUIが選択した競技に適した指標表示・推奨アクション文言になっていてほしい | Should | MVP |
| **傷害リスクの早期検知** | E1: EWMA-ACWR + 品質ゲート | AT として、選手のACWR・コンディションスコア・Z-Scoreをダッシュボードで確認し、閾値超過前に介入判断したい | Must | MVP |
| | | S&C として、トレーニング負荷入力後にACWR・単調性・プレパレッドネスが自動更新され、負荷調整の根拠を得たい | Must | MVP |
| | | ドクターとして、P2アラート（ACWR超過+ウェルネス悪化複合）を受け取り、介入指示を出したい | Must | MVP |
| **パイプライン基盤** | E2: Node 0-5 パイプライン（Go + TSフォールバック） | AT として、複数データソース（手動入力・CSV）からのデータが自動的に品質チェックされ、推論パイプラインに流れてほしい | Must | MVP |
| | | ドクターとして、推論結果にトレースIDが付与され、各ノードの中間出力を監査ログから確認したい | Must | MVP |
| | | スタッフとして、Go推論エンジン障害時にTSフォールバックが自動で機能し、保守的推奨が維持されてほしい | Must | MVP |
| **臨床意思決定支援** | E3: P1-P5 優先度階層 | ドクターとして、P1 (Critical) アラートを即時通知で受け取り、1分以内に確認できるようにしたい | Must | MVP |
| | | AT として、試合日・順化・減量のコンテキスト・オーバーライドが自動適用され、適切な閾値調整がされてほしい | Must | MVP |
| | | スタッフとして、P1-P2 推奨アクションの承認/修正/却下をワンクリックで行い、監査ログに記録したい | Must | MVP |
| **データ入力・統合** | E4: コンテキスト・インテーク | 選手として、sRPE・睡眠品質・主観的ウェルネスをモバイル画面で簡単に入力したい | Must | MVP |
| | | AT として、EHR既往歴をチェックボックス形式で入力し、RiskMultiplierに反映させたい | Must | MVP |
| | | S&C として、CSVでトレーニング負荷データを一括アップロードしたい | Must | MVP |
| **MDTコパイロット** | E5: 多職種チーム支援UI | スタッフとして、MDTコパイロット画面で選手のリスクサマリー・推論トレース・推奨アクションを一覧し、チームで判断を共有したい | Should | MVP |
| | | ドクターとして、推奨アクションに法的免責事項が表示され、臨床判断の補助であることが明示されてほしい | Must | MVP |
| **マルチテナント** | E6: チーム別設定 | AT として、チーム固有の判定閾値オフセット (+-20%) を管理画面から設定したい | Should | Phase 2 |
| | | 選手として、自分のデータのみ閲覧でき、他の選手のデータにはアクセスできないようにしたい (RLS) | Must | MVP |
| **品質ゲート・傾向通知** | E7: データ信頼性制御 | AT として、データ品質が低い場合（qualityScore < 0.6）にGREEN判定が自動でYELLOW+専門家確認に降格されてほしい | Must | MVP |
| | | スタッフとして、ACWR・ウェルネスの3日間傾向通知を受け取り、事前に対策を打ちたい | Should | MVP |

---

## 3. MVP スコープ定義

### 3.1 MVP 必須機能

| # | 機能 | ビジネス正当性 |
|---|------|---------------|
| M1 | **競技別SportProfileエンジン** (Go + TS) | コア差別化要因。チーム登録時の競技選択に基づき、推論パラメータ・UI表示・推奨アクションを自動最適化。競技を無視した汎用判定では専門家の信頼を得られない |
| M2 | **Node 0-5 パイプライン基盤** (Go + TSフォールバック) | 全推論のオーケストレーション。Go（8ms）をプライマリ、TS（~200ms）をフォールバックとしたデュアル構成 |
| M3 | **P1-P5 優先度階層 + コンテキスト・オーバーライド** | 臨床意思決定の緊急度制御。競技別ACWR閾値・痛み閾値の自動適用を含む |
| M4 | **inference_trace_logs テーブル + 監査ログ** | 医療領域の説明可能性・法的コンプライアンス。Day 1 から必須 |
| M5 | **データ入力 UI（sRPE・CSV・EHR チェックボックス）** | データなしにはモデルが動かない。手動入力 + CSV がMVPインテーク方式 |
| M6 | **MDT コパイロット画面** | スタッフがリスクサマリー・推奨アクションを確認・承認する主要インターフェース。競技別推奨アクション文言を表示 |
| M7 | **RLS ポリシー + 法的セーフガード** | マルチテナントセキュリティ + P1-P2推奨の自動実行禁止 |

### 3.2 Phase 2 以降（MVP 除外）

| # | 機能 | 除外理由 |
|---|------|---------|
| P2-1 | チーム別閾値オフセット管理 UI | SportProfileのグローバル定数でMVP開始可能。チーム数増加後 |
| P2-2 | 外部APIコネクタ（Catapult等） | MVPはCSV + 手動入力。Proチーム向け |
| P2-3 | GPS外部負荷の競技別正規化 | GPS連携自体がPhase 2。MVPはsRPE中心 |
| P2-4 | パラメータ手動微調整UI | Day 0はCSVエビデンスの固定値。Day 1以降の機能 |
| P2-5 | 競技追加（陸上・水泳等） | 5競技 + otherでMVP十分。ユーザー要望で追加 |

### 3.3 スコープ外

| # | 機能 | 除外理由 |
|---|------|---------|
| X1 | ODE 損傷エンジン | エビデンス監査でLevel 5（動物実験のみ）。EWMA-ACWRで代替 |
| X2 | EKF デカップリング | 学術論文ゼロ、偽陽性30%。ウェルネスZ-Score持続悪化パターンで代替 |
| X3 | Banister FFM | 統計的欠陥（Marchal 2025）。複合Readinessスコアで代替 |
| X4 | Python マイクロサービス | Go+TSデュアル構成に統一。Python依存は排除 |
| X5 | MRF 運動連鎖解析 | NetworkX実装工数大。Phase 2以降 |
| X6 | 応力集中テンソル | バイオメカニクスデータ未確定。Phase 2以降 |
| X7 | テレヘルス・保険請求・SSO | ADR-003 で廃止決定済み |
| X8 | ネイティブモバイルアプリ | Web-First/PWA 方針 |
| X9 | サンプルエントロピー | 高頻度IMU必要。Phase 3以降 |

---

## 4. KPI ツリー

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

### KPI 測定ソースマッピング

| KPI カテゴリ | 主な測定ソース |
|-------------|--------------|
| 獲得 | Supabase Auth, Web Analytics, organizations.sport |
| 活性化 | inference_trace_logs, daily_metrics |
| エンゲージメント | inference_trace_logs, アクセスログ |
| リテンション | billing テーブル, アプリ内サーベイ, injury_records |
| 収益 | Stripe API, billing テーブル, organizations |

---

## 5. 優先順位付きバックログ

### 凡例

- **担当エージェント**: @05-architect, @04-backend, @03-frontend, @06-data-engineer, @11-qa, @02-ui-ux
- **SP**: ストーリーポイント (フィボナッチ: 1, 2, 3, 5, 8, 13)
- **依存**: 先行タスクの #番号

### Sprint 1: 競技別基盤 + DB修正

| # | タスク名 | 担当 | SP | 依存 | 説明 |
|---|---------|------|-----|------|------|
| 1 | **Go: `sport_profiles.go` 作成** — 5競技のSportProfile定義（ACWR閾値・FeatureWeights・EWMAConfig・TissueDefaults・PainThresholdAdjust・推奨アクションテンプレート） | @04-backend | 5 | — | `pace-inference/internal/config/sport_profiles.go` |
| 2 | **Go: `config.go` にSportProfile統合** — `DefaultConfig()` → `ConfigForSport(sport string)` に変更。sportに応じたプロファイル自動選択 | @04-backend | 3 | 1 | `pace-inference/internal/config/config.go` |
| 3 | **TS: `sport-profiles.ts` 作成** — Go版と同一のSportProfile定義（TSフォールバック用） | @04-backend | 3 | 1 | `pace-platform/lib/engine/v6/config/sport-profiles.ts` |
| 4 | **TS: `config.ts` 作成** — PipelineConfig生成関数にsport引数追加 | @04-backend | 2 | 3 | `pace-platform/lib/engine/v6/config/config.ts` |
| 5 | **DB: `organizations` テーブルに `sport` カラム追加マイグレーション** | @06-data-engineer | 2 | — | `NOT NULL DEFAULT 'other'` |
| 6 | **DB: `athletes.is_contact_sport` カラム追加マイグレーション** — sportから自動導出する `GENERATED ALWAYS AS` 式 or トリガー | @06-data-engineer | 3 | 5 | |
| 7 | **API: `onboarding/setup` 修正** — organizations INSERTに `sport: body.sport` を追加 | @04-backend | 1 | 5 | 現在sportが保存されていないバグ修正 |
| 8 | **API: `pipeline/route.ts` 修正** — `organizations.sport` を取得し `AthleteContext.sport` にセット。`SportProfile` から `tissueHalfLifes` を動的に取得 | @04-backend | 3 | 3, 5 | 現在はハードコード値 |

### Sprint 2: Go/TS ノード競技対応

| # | タスク名 | 担当 | SP | 依存 | 説明 |
|---|---------|------|-----|------|------|
| 9 | **Go: Node 0 修正** — `SportProfile` をロードし `PipelineState.Config` を競技別に上書き | @04-backend | 3 | 2 | `node0_ingestion.go` |
| 10 | **Go: Node 2 修正** — `state.Config.EWMA` から競技別 AcuteSpan/ChronicSpan を使用 | @04-backend | 2 | 9 | `node2_feature.go` |
| 11 | **Go: Node 3 修正** — `state.Config.FeatureWeights` から競技別重みを使用 | @04-backend | 2 | 9 | `node3_inference.go` |
| 12 | **Go: Node 4 修正** — `SportProfile.ACWRRedLine` / `PainThresholdAdjust` を使用 | @04-backend | 3 | 9 | `node4_decision.go` |
| 13 | **Go: Node 5 修正** — 競技別推奨アクションテンプレート選択 | @04-backend | 3 | 1, 12 | `node5_presentation.go` |
| 14 | **TS: パイプライン競技対応** — Go側と同一ロジックをTSフォールバックに適用 | @04-backend | 5 | 3, 4 | `pace-platform/lib/engine/v6/pipeline.ts` |
| 15 | **Go: `pipeline_test.go` 競技別テスト追加** — 全5競技 x P1-P5 の判定テスト | @11-qa | 5 | 9-13 | |

### Sprint 3: データ入力 + 品質ゲート

| # | タスク名 | 担当 | SP | 依存 | 説明 |
|---|---------|------|-----|------|------|
| 16 | **DB: `inference_trace_logs` テーブル確認 + RLS + インデックス** | @06-data-engineer | 3 | — | 既存確認、不足分を補完 |
| 17 | **DB: `device_kappa` マスタテーブル作成** | @06-data-engineer | 2 | — | Catapult=0.9, GPS Watch=0.4, 手動入力=0.5 |
| 18 | **API: `POST /api/pipeline` トレースログ保存の完全化** — nodeResults の実値を保持・保存 | @04-backend | 3 | 16 | 現在ダミー値で保存されているバグ修正 |
| 19 | **Go/TS: 品質ゲート** — qualityScore < 0.6 の GREEN→YELLOW 降格 | @04-backend | 3 | 9 | 既存 `quality_gate.go` の確認・修正 |
| 20 | **Go/TS: 傾向通知** — 3日間線形回帰で閾値接近検出 | @04-backend | 3 | 9 | 既存 `trend.go` の確認・修正 |
| 21 | **RLS 実装**: Player（自分のみ）/ Coach（チーム全員）/ Doctor（トレースログ含む全データ） | @06-data-engineer | 5 | 16 | |

### Sprint 4: フロントエンド（データ入力）

| # | タスク名 | 担当 | SP | 依存 | 説明 |
|---|---------|------|-----|------|------|
| 22 | **FE: sRPE・睡眠品質・ウェルネス入力フォーム**（選手向けモバイル） | @03-frontend | 5 | — | |
| 23 | **FE: CSV アップロード画面**（S&C 向け、ドラッグ&ドロップ） | @03-frontend | 3 | — | |
| 24 | **FE: EHR 既往歴チェックボックス入力画面**（AT 向け） | @03-frontend | 3 | — | |
| 25 | **FE: セットアップウィザード改修** — 競技選択UIの強化（競技アイコン・説明文追加） | @03-frontend | 2 | 7 | |

### Sprint 5: フロントエンド（判定表示 + 競技別UI）

| # | タスク名 | 担当 | SP | 依存 | 説明 |
|---|---------|------|-----|------|------|
| 26 | **FE: MDT コパイロット画面** — リスクサマリー・推論トレース・推奨アクション・承認ボタン + 競技名表示 | @03-frontend | 8 | 18 | |
| 27 | **FE: P1 即時通知**（ブラウザ通知 / PWA Push）+ P2 担当者通知 | @03-frontend | 5 | 12 | |
| 28 | **FE: 法的免責事項コンポーネント** — 全推奨アクション表示時に注記 | @03-frontend | 2 | 26 | |
| 29 | **FE: 人間承認フローUI** — P1-P2 推奨は有資格スタッフ承認必須ゲート | @03-frontend | 5 | 26, 28 | |
| 30 | **FE: 競技別UI最適化** — ダッシュボードの指標表示を競技に応じて調整（野球: 投球負荷表示、ラグビー: 衝撃負荷表示、etc.） | @03-frontend | 5 | 8 | |
| 31 | **FE: 競技別推奨アクション文言** — Node 5の出力を元に、競技に適した表現で表示 | @03-frontend | 3 | 13, 26 | |

### Sprint 6: テスト + i18n

| # | タスク名 | 担当 | SP | 依存 | 説明 |
|---|---------|------|-----|------|------|
| 32 | **E2E: パイプライン全体実行** — 全5競技 x Node 0→5 の正常系・異常系・フォールバック | @11-qa | 8 | 14, 18 | |
| 33 | **E2E: 競技別P2閾値テスト** — soccer(1.5), baseball(1.3), basketball(1.4), rugby(1.5), other(1.5) | @11-qa | 5 | 15 | |
| 34 | **E2E: P1 アラート発火 → 通知 → 承認フロー** | @11-qa | 5 | 27, 29 | |
| 35 | **E2E: 品質ゲート降格テスト** — qualityScore < 0.6 で GREEN→YELLOW | @11-qa | 3 | 19 | |
| 36 | **パフォーマンステスト**: パイプライン全体レイテンシ計測（目標: Go < 50ms, TS < 500ms） | @11-qa | 3 | 32 | |
| 37 | **i18n: 全 UI テキスト日本語化** — 推奨アクション・アラート・法的免責事項・競技名 | @03-frontend | 3 | 26-31 | |

**MVP 合計: 約 140 SP（6 Sprint x ~23 SP/Sprint）**

### Phase 2（Sprint 7-10）

| # | タスク名 | 担当 | SP | 依存 | 説明 |
|---|---------|------|-----|------|------|
| 38 | チーム別閾値オフセット管理画面（±20%） | @03-frontend | 5 | 21 | |
| 39 | 外部APIコネクタ基盤（Catapult API認証 + データ取り込み） | @04-backend | 8 | — | |
| 40 | GPS外部負荷の競技別正規化（サッカー: HSR重視、ラグビー: 衝撃G重視） | @04-backend | 5 | 39, 1 | |
| 41 | パラメータ手動微調整UI（SportProfileの個別オーバーライド） | @03-frontend | 5 | 1 | |
| 42 | 競技追加プロファイル（陸上・水泳・テニス等） | @04-backend | 3 | 1 | |
| 43 | E2E テスト: GPS連携 + 競技別正規化 | @11-qa | 5 | 40 | |

---

## 6. 競技別UI/UX差分仕様

チーム登録時に選択した `sport` に基づき、以下のUI要素を自動的に切り替える。

### 6.1 ダッシュボード指標表示

| 指標 | soccer | baseball | basketball | rugby | other |
|------|--------|----------|-----------|-------|-------|
| 主要負荷指標 | ACWR + スプリント距離 | ACWR + 投球数 | ACWR + ジャンプ回数 | ACWR + 衝撃G | ACWR |
| 痛み表示 | 標準 NRS | 肩/肘 NRS 強調 | 膝/足首 NRS 強調 | 頭部/頸部 NRS 強調 | 標準 NRS |
| 推奨アクション例 | 「スプリント量を制限」 | 「投球数制限プロトコル」 | 「ジャンプ系ドリル制限」 | 「コンタクト練習除外」 | 「負荷軽減」 |

### 6.2 選手入力フォーム

| 項目 | soccer | baseball | basketball | rugby |
|------|--------|----------|-----------|-------|
| 追加入力項目 | — | 投球数（任意） | — | 衝撃回数（任意） |
| 痛み部位プリセット | 下肢中心 | 肩・肘・腰 | 膝・足首・腰 | 全身+頭部 |

### 6.3 レポート

| セクション | 競技別対応 |
|-----------|-----------|
| リスクサマリー | 競技名 + 適用されたACWR閾値を明記 |
| 推奨アクション | SportProfile.RecommendedActions から生成 |
| 傾向通知 | 「(競技名)の標準的な負荷パターンと比較して...」の文脈付与 |

---

## 付録A: ファイル構成方針（競技別ノード）

### Go推論エンジン（pace-inference/）

```
pace-inference/
  cmd/server/main.go
  internal/
    config/
      config.go                 ← ConfigForSport(sport) メイン関数
      sport_profiles.go         ← 【新規】5競技の SportProfile 定義
    domain/
      context.go                ← AthleteContext（Sport, IsContactSport 既存）
      types.go                  ← InferenceDecision, Priority 等
      sport.go                  ← 【新規】SportID 列挙型
    math/
      ewma.go, acwr.go, zscore.go, ...  ← 競技非依存の純粋数学関数
    pipeline/
      pipeline.go               ← PipelineState に Config を競技別で保持
      node0_ingestion.go        ← SportProfile ロード + Config 上書き
      node1_cleaning.go         ← 変更なし
      node2_feature.go          ← Config.EWMA から競技別スパン取得
      node3_inference.go        ← Config.FeatureWeights から競技別重み取得
      node4_decision.go         ← Config.Thresholds.ACWRRedLine 競技別
      node5_presentation.go     ← 競技別推奨アクションテンプレート
      quality_gate.go           ← 変更なし
      trend.go                  ← 変更なし
      state.go                  ← PipelineState（Config フィールド）
    handler/
      infer.go                  ← リクエストの sport フィールドから Config 選択
```

### TSフォールバック（pace-platform/lib/engine/v6/）

```
pace-platform/lib/engine/v6/
  types.ts                      ← AthleteContext（sport, isContactSport 既存）
  config/
    sport-profiles.ts           ← 【新規】5競技の SportProfile 定義
    config.ts                   ← 【新規】configForSport(sport) 関数
  pipeline.ts                   ← 競技別Config適用
  nodes/
    node0.ts ... node5.ts       ← Go側と同一ロジック
```

**重要: Go/TS間でSportProfileの値は完全一致させること。テストで値の一致を検証する。**

---

## 付録B: リスクと緩和策

| リスク | 影響度 | 緩和策 |
|--------|-------|--------|
| 競技別パラメータの初期値が不適切 | 高 | Level 2以上のエビデンスに基づく保守的固定値で開始。Phase 2で手動微調整UI提供 |
| 5競技以外のチームが登録 | 中 | `other` プロファイル（汎用値）でカバー。Phase 2で競技追加 |
| Go/TS間のSportProfile値不一致 | 高 | CI/CDでGo/TSの設定値一致テストを自動実行 |
| P1 アラートの偽陽性による「アラート疲れ」 | 高 | 信頼区間閾値 + コンテキスト・オーバーライドで精度担保。confidence低下時はP1→P2降格 |
| 競技別UIのメンテナンスコスト増 | 中 | SportProfile駆動の設定ベース設計（コード分岐ではなくデータ駆動） |

---

## 自律連鎖トリガー

```
プロダクト計画 v6.2 が完成しました。

主要な変更:
1. MVP必須機能からODE/EKF/Pythonを完全排除（7項目に再定義）
2. 全6ノードに競技別SportProfile設計を貫通
3. チーム登録→競技選択→UI/UX最適化のEnd-to-Endフロー
4. Go/TS両方の競技別configファイル分離方針
5. バックログを37タスク（140SP）に全面再構築

影響を受ける下流エージェント:
- @05-architect: Go/TSのファイル構成・CI/CDにSportProfile一致テスト追加
- @04-backend: sprint_profiles.go, config修正, Node 0-5の競技対応, onboarding修正
- @03-frontend: 競技別UI表示・推奨アクション文言・入力フォーム差分
- @06-data-engineer: organizations.sport, athletes.is_contact_sport マイグレーション
- @02-ui-ux: 競技別ダッシュボード・入力フォームのデザイン仕様
- @11-qa: 全5競技 x P1-P5 のE2Eテスト

@05-architect を呼び出します。
以下のバックログと技術要件を渡し、CI/CDパイプラインとシステムアーキテクチャの設計・構築を開始させます。
```
