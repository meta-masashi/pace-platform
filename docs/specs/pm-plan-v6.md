# PACE v6.0 プロダクトマネジメント計画書

- **作成日**: 2026-03-25
- **ステータス**: ドラフト
- **対象**: PACE Platform v6.0 — 数理モデル高度化 + 6層ノード・パイプライン
- **前提文書**: computational-biomechanics-v6.md, node-pipeline-architecture-v1.md, v6-hearing-decisions.md

---

## 1. ユーザーストーリーマップ

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
| **傷害リスクの早期検知** | E1: 組織損傷モデリング | AT として、選手の組織損傷蓄積レベル (D(t)) と修復能力 (R(t)) をダッシュボードで確認し、臨界閾値 (D_crit) 超過前に介入判断したい | Must | MVP |
| | | S&C として、トレーニング負荷入力後に ODE シミュレーション結果が自動更新され、負荷調整の根拠を得たい | Must | MVP |
| | | ドクターとして、D(t) が D_crit の 80% を超えた選手に P2 アラートを受け取り、精密検査指示を出したい | Must | MVP |
| | E2: デカップリング検出 (EKF) | AT として、トレーニング中の HR/HRV/負荷データを入力し、心肺-筋骨格デカップリング指標をリアルタイムで監視したい | Must | MVP |
| | | S&C として、デカップリング指標 > 0.10 の場合に自動で負荷軽減の推奨を受け取りたい | Must | MVP |
| | | 選手として、sRPE を入力した際に EKF のフィードバック（嘘検知）結果を確認したい | Should | MVP |
| **運動連鎖リスクの可視化** | E3: MRF 運動連鎖解析 | PT として、関節・筋群セグメントの連鎖的リスク波及パターンを確率的に把握し、予防的介入の優先部位を決定したい | Must | Phase 2 |
| | | AT として、ROM・筋力テスト・痛み評価の入力後に MRF 推論が実行され、隣接関節への波及リスクを確認したい | Must | Phase 2 |
| | E4: 応力集中テンソル | PT として、解剖学的部位ごとの脆弱性指標 (VI) を確認し、特定組織の過負荷リスクを定量的に評価したい | Should | Phase 2 |
| | | ドクターとして、既往歴のある部位の応力集中係数 (K_t) を考慮した修正 VI を用いて再発リスクを判断したい | Should | Phase 2 |
| **神経運動系の評価** | E5: サンプルエントロピー | AT として、バランステスト時系列データから SampEn を算出し、固有受容感覚の機能低下を早期に検出したい | Could | Phase 3 |
| | | PT として、多スケールエントロピー (MSE) プロファイルから神経運動系の複雑性低下パターンを把握したい | Could | Phase 3 |
| **パイプライン基盤** | E6: Node 0-5 パイプライン構築 | AT として、複数データソース（手動入力・CSV）からのデータが自動的に品質チェックされ、推論パイプラインに流れてほしい | Must | MVP |
| | | ドクターとして、推論結果にトレース ID が付与され、各ノードの中間出力を監査ログから確認したい | Must | MVP |
| | | スタッフとして、パイプライン障害時にフォールバックが機能し、保守的推奨が維持されてほしい | Must | MVP |
| **臨床意思決定支援** | E7: P1-P5 優先度階層 | ドクターとして、P1 (Critical) アラートを即時通知で受け取り、1分以内に確認できるようにしたい | Must | MVP |
| | | AT として、試合前 48h のコンテキスト・オーバーライドが自動適用され、軽微な異常も適切に昇格されてほしい | Must | MVP |
| | | スタッフとして、P1-P2 推奨アクションの承認/修正/却下をワンクリックで行い、監査ログに記録したい | Must | MVP |
| **データ入力・統合** | E8: コンテキスト・インテーク | 選手として、sRPE・睡眠品質・主観的ウェルネスをモバイル画面で簡単に入力したい | Must | MVP |
| | | AT として、EHR 既往歴をチェックボックス形式で入力し、RiskMultiplier に反映させたい | Must | MVP |
| | | S&C として、CSV でトレーニング負荷データを一括アップロードしたい | Must | MVP |
| **MDT コパイロット** | E9: 多職種チーム支援 UI | スタッフとして、MDT コパイロット画面で選手のリスクサマリー・推論トレース・推奨アクションを一覧し、チームで判断を共有したい | Should | MVP |
| | | ドクターとして、推奨アクションに法的免責事項が表示され、臨床判断の補助であることが明示されてほしい | Must | MVP |
| **マルチテナント** | E10: チーム別設定 | AT として、チーム固有の判定閾値オフセット (±20%) を管理画面から設定したい | Should | Phase 2 |
| | | 選手として、自分のデータのみ閲覧でき、他の選手のデータにはアクセスできないようにしたい (RLS) | Must | MVP |
| **パラメータ管理** | E11: モデル較正 | ドクターとして、ODE パラメータの初期値（CSV エビデンスベース）を確認し、UI から微調整したい | Should | Phase 2 |
| | | スタッフとして、90日以降はベイズ最適化による自動パラメータ更新が適用されてほしい | Could | Phase 3 |

---

## 2. MVP スコープ定義

### 2.1 MVP 必須機能

| # | 機能 | ビジネス正当性 |
|---|------|---------------|
| M1 | **Damage-Remodeling ODE エンジン** (Python) | コア価値の中心。組織損傷蓄積の非線形モデリングにより ACWR 単体では捉えられない閾値効果を検出。「破綻防止」が最大の差別化要因 |
| M2 | **EKF デカップリング検出** (Python) | sRPE と生理データの乖離検出（「嘘検知」）。MVP 段階で sRPE ベースの入力を信頼性担保するために必須 |
| M3 | **Node 0-5 パイプライン基盤** (TypeScript) | 全モデルのオーケストレーション基盤。`lib/engine/v6/` に新設し、既存 `conditioning/` ACWR を Node 4 コンポーネントとして吸収 |
| M4 | **P1-P5 優先度階層 + コンテキスト・オーバーライド** | 臨床意思決定の緊急度制御。試合前昇格・再発パターン検知は初期ユーザーの信頼獲得に直結 |
| M5 | **inference_trace_logs テーブル + 監査ログ** | 医療領域の説明可能性・法的コンプライアンス要件。Day 1 から必須 |
| M6 | **データ入力 UI（sRPE・CSV・EHR チェックボックス）** | データなしにはモデルが動かない。手動入力 + CSV がヒアリング決定済みの MVP インテーク方式 |
| M7 | **MDT コパイロット画面** | スタッフがリスクサマリー・推奨アクションを確認・承認する主要インターフェース |
| M8 | **RLS ポリシー（Player/Coach/Doctor）** | マルチテナントの基本セキュリティ。ヒアリングで確定済み |
| M9 | **法的セーフガード（免責事項表示・人間承認フロー）** | P1-P2 推奨の自動実行禁止。医療 SaaS の法的リスク回避 |
| M10 | **Python マイクロサービス基盤** (Lambda/Cloud Functions) | ODE・EKF の計算実行環境。Edge Functions をゲートウェイとして構築 |

### 2.2 Phase 2 以降（MVP 除外）

| # | 機能 | 除外理由 |
|---|------|---------|
| P2-1 | **MRF 運動連鎖解析** | NetworkX + カスタム LBP の実装工数が大きい。MVP では ODE の組織単体評価で価値検証可能。「文脈の接続」は Phase 2 |
| P2-2 | **応力集中テンソル** | バイオメカニクスデータ（モーションキャプチャ等）の取得環境が MVP 対象チームで未確定。既往歴ベースの SCF 固定値は ODE に内包可能 |
| P2-3 | **チーム別閾値オフセット管理 UI** | グローバル定数で MVP 開始可能。チーム数が増えた段階で必要 |
| P2-4 | **外部 API コネクタ（Catapult 等）** | MVP は CSV + 手動入力で開始。Pro チーム向け機能 |
| P2-5 | **パラメータ手動微調整 UI** | Day 0 は CSV エビデンスの固定値で開始。Day 1 以降の機能 |
| P3-1 | **サンプルエントロピー (SampEn/MSE)** | 高頻度 IMU データ（100Hz, N>=1000）が必要。計算負荷最大。Phase 3 で IMU 連携後に導入 |
| P3-2 | **ベイズ最適化による自動パラメータ更新** | 90日以上のデータ蓄積が前提。MVP ローンチ後に着手 |

### 2.3 スコープ外

| # | 機能 | 除外理由 |
|---|------|---------|
| X1 | テレヘルス連携 | ADR-003 で廃止決定済み |
| X2 | 保険請求連携 | ADR-003 で廃止決定済み |
| X3 | エンタープライズ SSO | ADR-003 で廃止決定済み |
| X4 | ネイティブモバイルアプリ | Phase 1 Web-First/PWA 方針で除外 |
| X5 | リアルタイム IMU ストリーミング | IMU なし時はバイパス。Phase 3 以降に検討 |
| X6 | DBN / 反事実推論 | GTM ロードマップで 2028 年以降の機能 |

---

## 3. KPI ツリー

```
PACE v6.0 トップゴール
「スポーツ傷害の発生率を 30% 低減する」
│
├── 獲得 (Acquisition)
│   ├── KPI: 月間新規チーム登録数
│   │   └── 測定: Supabase auth.users + organizations テーブル
│   ├── KPI: MVP トライアル開始率（LP → サインアップ）
│   │   └── 測定: Web アナリティクス (コンバージョン率)
│   └── KPI: CSV データアップロード完了率（オンボーディング）
│       └── 測定: Node 0 ingestion_success_count / trial_users
│
├── 活性化 (Activation)
│   ├── KPI: 初回パイプライン実行完了率
│   │   └── 測定: inference_trace_logs WHERE pipeline_version = 'v1.0' (初回)
│   ├── KPI: 初回 P2+ アラート受領 → 対応完了率
│   │   └── 測定: trace_logs.review_decision IS NOT NULL / P2+ count
│   └── KPI: sRPE 入力開始率（選手側）
│       └── 測定: Node 0 sRPE records / active_athletes
│
├── エンゲージメント (Engagement)
│   ├── KPI: 週間パイプライン実行回数 / チーム
│   │   └── 測定: inference_trace_logs GROUP BY organization, week
│   ├── KPI: MDT コパイロット画面の DAU / MAU
│   │   └── 測定: アクセスログ (Node 5 presentation access)
│   ├── KPI: 推奨アクション承認率 (ACCEPTED / total reviews)
│   │   └── 測定: trace_logs.review_decision = 'ACCEPTED'
│   ├── KPI: D(t) > 0.8·D_crit アラート発火回数
│   │   └── 測定: trace_logs WHERE risk_score > threshold
│   ├── KPI: EKF デカップリング検出回数
│   │   └── 測定: Python microservice decoupling_index > 0.10 logs
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
    └── KPI: Phase 2 アップセル転換率
        └── 測定: MRF/Tensor 機能有効化チーム数
```

### KPI 測定ソースマッピング

| KPI カテゴリ | 主な測定ソース |
|-------------|--------------|
| 獲得 | Supabase Auth, Web Analytics, Node 0 ログ |
| 活性化 | inference_trace_logs, Node 0 ingestion ログ |
| エンゲージメント | inference_trace_logs, アクセスログ, Python microservice ログ |
| リテンション | billing テーブル, アプリ内サーベイ, injury_records |
| 収益 | Stripe API, billing テーブル |

---

## 4. 優先順位付きバックログ

### 凡例

- **担当エージェント**: Arch = アーキテクト, BE = バックエンド, FE = フロントエンド, DS = データサイエンス (Python), DB = データベース, QA = テスト
- **SP**: ストーリーポイント (フィボナッチ: 1, 2, 3, 5, 8, 13)
- **依存**: 先行タスクの #番号

### MVP フェーズ（Sprint 1-6）

| # | タスク名 | 担当 | SP | 依存 | フェーズ |
|---|---------|------|-----|------|---------|
| 1 | `lib/engine/v6/` ディレクトリ構造 + `PipelineContext`, `NodeResult`, `NodeExecutor` 型定義 | Arch | 3 | — | MVP-S1 |
| 2 | `InferencePipeline` 実行エンジン（register/execute/handleNodeFailure） | Arch | 5 | 1 | MVP-S1 |
| 3 | Node 0: Data Ingestion（sRPE 手動入力 + CSV パーサー + 正規化） | BE | 5 | 1 | MVP-S1 |
| 4 | Node 1: Data Cleaning（欠損値補間・外れ値検出・quality_score 算出） | BE | 5 | 1 | MVP-S1 |
| 5 | DB マイグレーション: `assessments` テーブル拡張（pipeline_version, node_outputs, inference_priority, trace_id） | DB | 3 | — | MVP-S1 |
| 6 | DB マイグレーション: `inference_trace_logs` テーブル作成 + RLS ポリシー + インデックス | DB | 5 | 5 | MVP-S1 |
| 7 | Python マイクロサービス基盤: プロジェクト構成 + Lambda/Cloud Functions デプロイ設定 + SciPy/FilterPy 依存関係 | DS | 5 | — | MVP-S2 |
| 8 | Python: Damage-Remodeling ODE 実装（`damage_remodeling_ode`, `simulate_damage`） | DS | 8 | 7 | MVP-S2 |
| 9 | Python: ODE パラメータセット定義（組織カテゴリ 4層: Metabolic/Structural-Soft/Structural-Hard/Neuromotor 半減期対応） | DS | 3 | 8 | MVP-S2 |
| 10 | Python: EKF デカップリング検出実装（`DecouplingEKF` クラス + `update` メソッド） | DS | 8 | 7 | MVP-S2 |
| 11 | Python: REST API エンドポイント（/compute/ode, /compute/ekf）+ JSON I/O スキーマ | DS | 5 | 8, 10 | MVP-S2 |
| 12 | Edge Functions ゲートウェイ: Python マイクロサービスへのプロキシ + 認証 + タイムアウト制御 | BE | 5 | 11 | MVP-S3 |
| 13 | Node 2: Feature Engineering（ACWR 特徴量 + ODE 出力統合 + EKF 出力統合 → 特徴量ベクトル生成） | BE | 8 | 4, 12 | MVP-S3 |
| 14 | Node 3: Inference Engine（ロジスティック回帰リスクスコア + ベイジアン事後更新 + 信頼区間伝播） | BE | 8 | 13 | MVP-S3 |
| 15 | 既存 `lib/conditioning/engine.ts` EWMA/ACWR → Node 2-3 コンポーネント吸収リファクタリング | Arch | 5 | 13, 14 | MVP-S3 |
| 16 | 既存 `lib/bayes/inference.ts` DAG 推論 → Node 3 統合 | Arch | 3 | 14 | MVP-S3 |
| 17 | 既存 `lib/decay/calculator.ts` 時間減衰 → Node 2 の組織カテゴリ別半減期計算に統合 | Arch | 3 | 13 | MVP-S3 |
| 18 | Node 4: Decision Support（P1-P5 優先度判定 `determinePriority` + コンテキスト・オーバーライド `applyContextualOverrides`） | BE | 5 | 14 | MVP-S4 |
| 19 | Node 5: Presentation & Audit（推奨アクション生成 + trace_log 保存 + `inference_trace_logs` INSERT） | BE | 5 | 18, 6 | MVP-S4 |
| 20 | Node 0: EHR 既往歴チェックボックス入力 + RiskMultiplier 反映 | BE | 3 | 3 | MVP-S4 |
| 21 | API ルート: `POST /api/pipeline` パイプライン実行エンドポイント | BE | 3 | 2, 19 | MVP-S4 |
| 22 | API ルート: `GET /api/pipeline/trace/[traceId]` トレースログ取得 | BE | 2 | 19 | MVP-S4 |
| 23 | FE: sRPE・睡眠品質・ウェルネス入力フォーム（選手向け） | FE | 5 | 3 | MVP-S4 |
| 24 | FE: CSV アップロード画面（S&C 向け、ドラッグ&ドロップ） | FE | 3 | 3 | MVP-S4 |
| 25 | FE: EHR 既往歴チェックボックス入力画面（AT 向け） | FE | 3 | 20 | MVP-S4 |
| 26 | FE: MDT コパイロット画面（リスクサマリー・推論トレース・推奨アクション・承認/修正/却下ボタン） | FE | 8 | 21, 22 | MVP-S5 |
| 27 | FE: P1 即時通知（ブラウザ通知 / PWA Push）+ P2 担当者通知 | FE | 5 | 18 | MVP-S5 |
| 28 | FE: 法的免責事項コンポーネント（全推奨アクション表示時に注記） | FE | 2 | 26 | MVP-S5 |
| 29 | FE: 人間承認フローUI（P1-P2 推奨は有資格スタッフ承認必須ゲート） | FE | 5 | 26, 28 | MVP-S5 |
| 30 | RLS 実装: Player（自分のみ）/ Coach（チーム全員）/ Doctor（トレースログ含む全データ） | DB | 5 | 6 | MVP-S5 |
| 31 | E2E テスト: パイプライン全体実行（Node 0 → 5 の正常系・異常系・フォールバック） | QA | 8 | 19, 21 | MVP-S6 |
| 32 | E2E テスト: P1 アラート発火 → 通知 → 承認フロー | QA | 5 | 27, 29 | MVP-S6 |
| 33 | E2E テスト: ODE 臨界閾値超過シナリオ | QA | 3 | 8, 14 | MVP-S6 |
| 34 | E2E テスト: EKF デカップリング検出 → sRPE 乖離シナリオ | QA | 3 | 10, 14 | MVP-S6 |
| 35 | パフォーマンステスト: パイプライン全体レイテンシ計測（目標: P1 < 1分, P2 < 15分） | QA | 3 | 31 | MVP-S6 |
| 36 | i18n: 全 UI テキスト日本語化（推奨アクション・アラート・法的免責事項） | FE | 3 | 26-29 | MVP-S6 |
| 37 | `device_kappa` マスタテーブル作成（Catapult=0.9, GPS Watch=0.4, 手動入力=0.5） | DB | 2 | 5 | MVP-S6 |

**MVP 合計: 約 180 SP（6 Sprint × 30 SP/Sprint 想定）**

### Phase 2（Sprint 7-10）

| # | タスク名 | 担当 | SP | 依存 | フェーズ |
|---|---------|------|-----|------|---------|
| 38 | Python: MRF Kinetic Chain 実装（`KineticChainMRF` + Loopy Belief Propagation） | DS | 13 | 7 | Ph2-S7 |
| 39 | Python: MRF API エンドポイント（/compute/mrf）+ 結合強度行列管理 | DS | 5 | 38 | Ph2-S7 |
| 40 | Python: 応力集中テンソル実装（`VulnerabilityTensor` + Von Mises + 主応力解析） | DS | 8 | 7 | Ph2-S8 |
| 41 | Python: テンソル API エンドポイント（/compute/tensor）+ 身体部位別 SCF/σ_yield マスタ | DS | 5 | 40 | Ph2-S8 |
| 42 | Node 2-3 拡張: MRF 特徴量統合（セグメント別周辺確率 → 特徴量ベクトル） | BE | 5 | 39 | Ph2-S8 |
| 43 | Node 2-3 拡張: テンソル特徴量統合（VI_modified → 特徴量ベクトル） | BE | 5 | 41 | Ph2-S8 |
| 44 | FE: 運動連鎖リスクマップ（人体図上にセグメント別リスク可視化） | FE | 8 | 42 | Ph2-S9 |
| 45 | FE: 応力集中ヒートマップ（部位別 VI 表示） | FE | 5 | 43 | Ph2-S9 |
| 46 | FE: チーム別閾値オフセット管理画面（±20%） | FE | 5 | 30 | Ph2-S9 |
| 47 | FE: パラメータ手動微調整 UI（ODE α, β, n 等の感度設定） | FE | 5 | 9 | Ph2-S9 |
| 48 | 外部 API コネクタ基盤（Catapult API 認証 + データ取り込み） | BE | 8 | 3 | Ph2-S10 |
| 49 | E2E テスト: MRF 連鎖波及シナリオ | QA | 5 | 42 | Ph2-S10 |
| 50 | E2E テスト: テンソル臨界 VI シナリオ | QA | 3 | 43 | Ph2-S10 |

### Phase 3（Sprint 11-13）

| # | タスク名 | 担当 | SP | 依存 | フェーズ |
|---|---------|------|-----|------|---------|
| 51 | Python: サンプルエントロピー実装（EntropyHub SampEn + MSEn） | DS | 8 | 7 | Ph3-S11 |
| 52 | Python: SampEn API エンドポイント + 測定プロトコル設定 (m, r, N) | DS | 3 | 51 | Ph3-S11 |
| 53 | Node 2 拡張: SampEn/MSE 特徴量統合（`NeuromotorFeatures`） | BE | 5 | 52 | Ph3-S12 |
| 54 | FE: 神経運動系ダッシュボード（SampEn 時系列 + MSE プロファイル表示） | FE | 8 | 53 | Ph3-S12 |
| 55 | ベイズ最適化パラメータ自動更新エンジン（90日蓄積データ → α, β, n 等の最適化） | DS | 13 | 8, 9 | Ph3-S12 |
| 56 | IMU リアルタイムストリーミング基盤（WebSocket + データバッファリング） | BE | 13 | 48 | Ph3-S13 |
| 57 | E2E テスト: SampEn 計算精度検証 + パフォーマンステスト | QA | 5 | 53 | Ph3-S13 |

---

## 付録: アーキテクチャ移行方針

### 既存コードの吸収マップ

| 既存モジュール | パス | 吸収先 | タスク # |
|--------------|------|--------|---------|
| EWMA/ACWR エンジン | `lib/conditioning/engine.ts` | Node 2-3 の ACWR コンポーネント（数式 v6.0 にアップデート） | #15 |
| EWMA 計算 | `lib/conditioning/ewma.ts` | Node 2 の時系列集約 | #15 |
| CAT エンジン | `lib/assessment/cat-engine.ts` | Node 1 のデータ入力インターフェースとして存続 | #4 |
| 事後更新 | `lib/assessment/posterior-updater.ts` | Node 3 のベイジアン推論コンポーネント | #16 |
| DAG 推論 | `lib/bayes/inference.ts` | Node 3 の推論基盤 | #16 |
| コンテキストビルダー | `lib/bayes/context-builder.ts` | Node 0 のコンテキスト構築 | #3 |
| 時間減衰計算 | `lib/decay/calculator.ts` | Node 2 の組織カテゴリ別半減期 | #17 |
| 慢性修飾子 | `lib/decay/chronic-modifier.ts` | Node 2 の慢性負荷計算 | #17 |

### Python マイクロサービス ライブラリ依存

| ライブラリ | バージョン | 用途 | フェーズ |
|-----------|-----------|------|---------|
| SciPy | >= 1.10 | ODE 数値積分 (`solve_ivp`) | MVP |
| FilterPy | >= 1.4 | EKF 基盤 | MVP |
| NumPy | >= 1.24 | テンソル計算・行列演算 | MVP |
| NetworkX | >= 3.0 | MRF グラフ構造管理 | Phase 2 |
| EntropyHub | >= 0.3 | SampEn/MSEn 高速計算 | Phase 3 |

---

## 付録: リスクと緩和策

| リスク | 影響度 | 緩和策 |
|--------|-------|--------|
| Python マイクロサービスのコールドスタート遅延 | 高 | Lambda Provisioned Concurrency / Cloud Run min-instances で常時ウォーム維持 |
| ODE パラメータの初期値が臨床的に不適切 | 高 | Day 0 は CSV エビデンス + 先行研究（Banister モデル等）の保守的固定値で開始。Day 1 から手動微調整可能 |
| EKF の IMU なし運用でデカップリング精度低下 | 中 | IMU なし時は EKF をバイパスし sRPE のみで推論。device_kappa でデータ信頼度を反映 |
| P1 アラートの偽陽性による「アラート疲れ」 | 高 | 信頼区間閾値 (confidence > 0.80) とコンテキスト・オーバーライドの組み合わせで精度担保。confidence 低下時は自動で P1 → P2 降格 |
| 並行運用による判断不一致 | 高 | ヒアリングで確定済み: 並行運用禁止。v6.0 エンジンへの一本化 |
