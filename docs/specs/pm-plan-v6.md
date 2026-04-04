# PACE v6.3 プロダクトマネジメント計画書

- **作成日**: 2026-03-25
- **最終更新**: 2026-04-04
- **ステータス**: 確定（Sprint 1 完了）
- **対象**: PACE Platform v6.3 — Go推論エンジン + エビデンスベース6ノードパイプライン + アセスメント/シミュレータ
- **前提文書**: MASTER-SPEC-CURRENT.md (v6.3)
- **技術スタック**: Next.js 15 + React 19 / Supabase (PostgreSQL, pgvector) / Go推論エンジン(pace-inference/) + TSフォールバック / Gemini 2.0 Flash（テキスト整形のみ） / Stripe / GitHub Actions + Vercel

---

## 変更履歴

| 日付 | バージョン | 変更サマリー |
|------|-----------|-------------|
| 2026-03-25 | v6.0 | 初版作成（ODE/EKF/MRF前提のPython計算モデル） |
| 2026-04-04 | v6.3 | **大規模更新**: ODE/EKF/FFM排除（エビデンス監査結果）、Go推論エンジン採用、アセスメント3軸フロー追加、シミュレータ2トラック追加、競技別プロファイル統合、プラン別機能ゲート定義、platform_admin画面追加、ログインURL分離、Sprint計画刷新（S1完了済み） |

---

## 1. ユーザーストーリーマップ

### アクター定義

| アクター | 略称 | 説明 |
|---------|------|------|
| アスレティックトレーナー (AT) | スタッフ | 日常のコンディション管理・傷害予防 |
| 理学療法士 (PT) | スタッフ | リハビリ計画・運動連鎖評価 |
| ドクター | スタッフ | 臨床判断・P1/P2 承認権限 |
| S&C コーチ | スタッフ | トレーニング負荷管理・パフォーマンス最適化 |
| 選手 | 選手 | 自己管理・主観データ入力（モバイルPWA） |
| プラットフォーム管理者 | platform_admin | システム全体監視・課金管理（顧客データ閲覧不可） |

### ストーリーマップ

| ゴール | エピック | ユーザーストーリー | 優先度 | フェーズ |
|--------|---------|-------------------|--------|---------|
| **傷害リスクの早期検知** | E1: Daily Input → 自動トリアージ | 選手として、毎朝のチェックイン（NRS/疲労/睡眠/sRPE/ボディマップ）を Bio-Swipe UIで素早く入力し、自分のコンディション状態を確認したい | Must | MVP(S1完了) |
| | | AT として、選手のDaily Inputに基づくP1-P5自動判定結果をダッシュボードで確認し、要確認選手に即座に介入判断したい | Must | MVP(S1完了) |
| | | ドクターとして、P1 (Critical) アラートを即時通知で受け取り、1分以内に確認できるようにしたい | Must | MVP(S1完了) |
| | E2: EWMA-ACWR負荷モニタリング | S&C として、ACWR（急性/慢性負荷比）とMonotonyの推移をダッシュボードで確認し、負荷調整の根拠を得たい | Must | MVP(S1完了) |
| | | AT として、ACWR > 競技別閾値 かつ ウェルネス悪化時にP2アラートを受け取り、負荷軽減指示を出したい | Must | MVP(S1完了) |
| | E3: デカップリング・Z-Score監視 | AT として、心拍-負荷デカップリング高値の選手にP3アラートを受け取り、効率低下を早期検出したい | Must | MVP(S1完了) |
| | | S&C として、Z-Score ≤ -1.5 が2項目以上の選手にP4（蓄積疲労）アラートを受け取りたい | Must | MVP(S1完了) |
| **コンディション評価の3軸分析** | E4: アセスメント（Active選手） | AT として、要確認選手の負荷集中（ACWR/Monotony/組織負担）を詳細分析し、介入優先度を決定したい | Must | S2-S4 |
| | | PT として、運動効率（デカップリング/主観客観ギャップ/Z-Scoreレーダー）を確認し、機能低下パターンを把握したい | Must | S3-S4 |
| | | ドクターとして、疼痛パターン（NRS推移/ボディマップ/既往照合/代償パターン）を確認し、臨床判断を補助したい | Must | S4 |
| | | スタッフとして、総合評価タブでリスクサマリー・ベイズ事後確率・推奨アクションを一覧し、評価を完了したい | Must | S4 |
| **リハビリ管理** | E5: リハビリアセスメント（Rehab選手） | PT として、リハビリ選手のPhase進捗・回復度・NRS推移・復帰基準チェックを確認し、Phase移行判定をしたい | Must | S4 |
| | | AT として、リハビリ種目の追加/除外を安全上限チェック付きでシミュレーションしたい | Should | S5 |
| **介入シミュレーション** | E6: コンディショニング・シミュレータ | S&C として、「もし明日からこの負荷に変更したら」のACWR/Monotony推移予測を確認し、最適な負荷計画を立てたい | Should | S5 |
| | | AT として、複数シナリオを比較し、復帰速度×再発リスクのバランスで最適計画を選択したい | Should | S5 |
| | E7: リハビリ・シミュレータ | PT として、リハビリ種目の追加/変更が復帰タイムラインにどう影響するかを事前にシミュレーションしたい | Should | S5 |
| **AI補助** | E8: SOAP補助 + 評価サジェスト | ドクターとして、Pro限定でSOAPノートのAI補助（構造化/鑑別/計画生成）を利用し、記録効率を向上させたい | Could | S6 |
| | | スタッフとして、総合評価のAIサジェスト（採用/修正/無視の3択）で評価品質を向上させたい | Could | S6 |
| **データ品質ゲート** | E9: 品質ゲート + 傾向通知 | スタッフとして、qualityScore低下時に自動判定が抑制され「専門家の確認を推奨」と表示されてほしい | Must | MVP(S1完了) |
| | | AT として、閾値接近中の選手に傾向通知（Trend Notice）が表示され、予防的介入のタイミングを掴みたい | Must | MVP(S1完了) |
| **マルチテナント・セキュリティ** | E10: RLS + 認証分離 | 選手として、自分のデータのみ閲覧でき、他の選手のデータにはアクセスできないようにしたい（RLS） | Must | MVP(S1完了) |
| | | platform_admin として、全体KPI（契約数・MRR・エラー率）を監視するが、個別顧客データは閲覧できないようにしたい | Must | S2以降 |
| **競技別最適化** | E11: SportProfile | AT として、チーム登録時に競技（サッカー/野球/バスケ/ラグビー）を選択し、競技特性に最適化された閾値で自動判定されてほしい | Must | MVP(S1完了) |
| **法的セーフガード** | E12: 免責事項 + 人間承認 | ドクターとして、全推奨アクション表示時に法的免責事項が明示され、臨床判断の補助であることが担保されてほしい | Must | S3-S4 |
| | | スタッフとして、P1-P2推奨アクションの承認/修正/却下をワンクリックで行い、監査ログに記録したい | Must | S3-S4 |
| **プラン別機能ゲート** | E13: Feature Gate | スタッフとして、契約プラン（Free/Standard/Pro/Pro+CV/Enterprise）に応じた機能のみ利用でき、アップグレード誘導が明確にされてほしい | Must | S2 |
| **ログインURL完全分離** | E14: 認証フロー分離 | スタッフとして、選手と混同しない専用ログインURL(`/auth/login`)からログインし、`/dashboard`に遷移したい | Must | S7 |
| | | 選手として、専用ログインURL(`/auth/athlete-login`)からMagic Linkでログインし、`/home`に遷移したい | Must | S7 |
| | | スタッフとして、選手URLに誤アクセスした場合「スタッフの方はこちら」リンクで正しいページに誘導されたい | Must | S7 |
| **選手セルフサインアップ** | E15: チームコード + セルフ登録 | 選手として、チームの管理者から受け取ったチームコードを入力し、自分でアカウントを作成してチームに参加したい | Must | S7 |
| | | masterとして、チームコードを生成・管理（有効期限・使用回数制限・無効化）し、選手の自己登録を安全にコントロールしたい | Must | S7 |
| **ロール切替スイッチ** | E16: 選手兼スタッフ切替 | 選手兼スタッフとして、スタッフログイン後にヘッダーの切替トグルで選手ビュー(`/home`)に遷移し、自分のコンディションを確認したい | Should | S7 |
| | | 選手ログインからはスタッフビューへの切替は不可（セキュリティ上、権限昇格禁止） | Must | S7 |
| **プラットフォーム管理画面** | E17: platform_admin管理画面 | platform_adminとして、P1ダッシュボードで全体KPI（契約数・MRR・未払い・エラー・利用率）を一目で把握したい | Must | S8 |
| | | platform_adminとして、P2決済状況でStripe請求一覧・未払い/Dunning・MRR推移を確認し、収益状況を管理したい | Must | S8 |
| | | platform_adminとして、P3契約チーム画面でプラン情報と変更依頼を一元管理したい（プラン管理は契約チームと統合） | Must | S8 |
| | | platform_adminとして、P4システムエラーでAPIエラー率・Sentry連携・エンジン稼働状況を監視したい | Must | S9 |
| | | platform_adminとして、P5推論エンジン監視でGo/TS切替・レイテンシ・Shadow Mode結果を確認したい | Should | S9 |
| | | platform_adminとして、P6利用率で組織別DAU/MAU・チェックイン率を把握したい | Should | S9 |
| | | platform_adminとして、P7エンジン成長率でデータ蓄積量・推論精度・データ品質を組織別に確認したい（契約チーム基礎情報とは別画面） | Should | S9 |
| **プラン変更依頼管理** | E18: プラン変更依頼フロー | masterとして、プラン変更をリクエストし、platform_adminの承認を経て変更を実行したい | Must | S8 |
| | | platform_adminとして、プラン変更依頼一覧を確認し、承認/却下を行いたい | Must | S8 |

---

## 2. MVP スコープ定義

> **重要な変更（v6.0 → v6.3）**: エビデンス監査の結果、ODE損傷エンジン・EKFデカップリング・Banister FFMは全てLevel 5エビデンス（動物実験のみ/学術論文ゼロ/統計的欠陥）として排除。Go推論エンジンによるEWMA-ACWR + ウェルネスZ-Score + ロジスティックリスクスコアに一本化。

### 2.1 MVP 必須機能（Sprint 1 完了済み）

| # | 機能 | ビジネス正当性 | 状態 |
|---|------|---------------|------|
| M1 | **Go推論エンジン（6ノードパイプライン）** | レイテンシ8ms、バイナリ6.1MB。EWMA-ACWR + Z-Score + ロジスティック回帰。TSフォールバック付き | ✅ 完了 |
| M2 | **P1-P5 優先度階層 + コンテキスト・オーバーライド** | 臨床意思決定の緊急度制御。試合日/順化/減量/NSAID/コンタクト対応 | ✅ 完了 |
| M3 | **品質ゲート + 信頼度レベル** | qualityScore < 0.6 で自動判定抑制 → 専門家委譲。偽陽性抑制に必須 | ✅ 完了 |
| M4 | **傾向通知（Trend Notice）** | 直近3日間の線形回帰で閾値接近を検出。判定色は変えず通知のみ | ✅ 完了 |
| M5 | **段階的Z-Score（14日の崖解消）** | 0-13日:0%/14-21日:50%/22-27日:75%/28日+:100%。新規選手の誤判定防止 | ✅ 完了 |
| M6 | **Daily Input（選手チェックイン）** | NRS/疲労/睡眠/sRPE/ボディマップ。Bio-Swipe UI。パイプライン入力の生命線 | ✅ 完了 |
| M7 | **ダッシュボード（基本）** | 入力率/要確認選手/リハビリ中選手/良好選手。スタッフの主要作業画面 | ✅ 完了 |
| M8 | **RLS（org_id分離 + user_id分離）** | 選手は自分のみ/スタッフはチーム全員/platform_adminは集計ビューのみ | ✅ 完了 |
| M9 | **inference_trace_logs + 監査ログ** | 医療領域の説明可能性・法的コンプライアンス要件 | ✅ 完了 |
| M10 | **競技別プロファイル（SportProfile）** | 5競技（サッカー/野球/バスケ/ラグビー/その他）の閾値自動適用 | ✅ 完了 |

### 2.2 Sprint 2-6 必須機能

| # | 機能 | ビジネス正当性 | フェーズ |
|---|------|---------------|---------|
| S2-1 | **アセスメントDB基盤** | conditioning_assessments / rehab_exercises / rehab_prescriptions テーブル | S2 |
| S2-2 | **アセスメントAPI** | 3軸分析データ集約 + 保存 + リハビリデータ | S2 |
| S2-3 | **Feature Gate（plan-gates）** | Free/Standard/Pro/Pro+CV/Enterprise のアクセス制御 | S2 |
| S3-1 | **ダッシュボード強化** | チーム負荷サマリー/要確認選手カード/リハビリ中選手セクション | S3 |
| S3-2 | **アセスメントUI前半** | Tab 1: 負荷集中分析 / Tab 2: 運動効率分析 | S3 |
| S4-1 | **アセスメントUI後半** | Tab 3: 疼痛パターン / Tab 4: 総合評価 | S4 |
| S4-2 | **シミュレータAPI** | コンディショニング + リハビリ バックエンド | S4 |
| S4-3 | **リハビリアセスメントUI** | 回復進捗/復帰基準チェック/Phase移行判定 | S4 |
| S5-1 | **シミュレータUI** | コンディショニング・シミュレータ + リハビリ・シミュレータ画面 | S5 |
| S6-1 | **AI SOAP補助（Pro限定）** | S/O構造化 + A鑑別 + P計画生成 | S6 |
| S6-2 | **E2Eテスト + 品質保証** | アセスメント/シミュレータフロー全体テスト | S6 |

### 2.3 スコープ外（理由付き）

| # | 機能 | 除外理由 |
|---|------|---------|
| X1 | **ODE損傷エンジン** | Level 5エビデンス（動物実験のみ）。EWMA-ACWRで代替 |
| X2 | **EKFデカップリング** | 学術論文ゼロ、偽陽性30%。ウェルネスZ-Score持続悪化パターンで代替 |
| X3 | **Banister FFM** | 統計的欠陥（Marchal 2025）。複合Readinessスコアで代替 |
| X4 | **Φ構造的脆弱性テンソル** | Level 5（FEMベース）。傷害歴リスク乗数で代替 |
| X5 | **MRF運動連鎖解析** | エビデンス不足 + 実装工数大。将来のエビデンス蓄積後に再評価 |
| X6 | **サンプルエントロピー(SampEn/MSE)** | 高頻度IMUデータ（100Hz, N>=1000）が必要。現状のデータ環境で実装不可 |
| X7 | テレヘルス連携 | ADR-003 で廃止決定済み |
| X8 | 保険請求連携 | ADR-003 で廃止決定済み |
| X9 | エンタープライズ SSO | ADR-003 で廃止決定済み |
| X10 | ネイティブモバイルアプリ | Web-First/PWA 方針で除外 |
| X11 | リアルタイム IMU ストリーミング | 将来検討。Phase 3 以降 |
| X12 | DBN / 反事実推論（プロダクション利用） | 内部シミュレータAPI経由で使用（直接公開しない） |

---

## 3. KPI ツリー

```
PACE v6.3 トップゴール
「スポーツ傷害の発生率を 30% 低減する」
│
├── 獲得 (Acquisition)
│   ├── KPI: 月間新規チーム登録数
│   │   └── 測定: Supabase auth.users + organizations テーブル
│   ├── KPI: トライアル開始率（LP → サインアップ）
│   │   └── 測定: Web アナリティクス (コンバージョン率)
│   └── KPI: 初回チェックイン完了率（オンボーディング）
│       └── 測定: daily_metrics WHERE created_at - org.created_at < 7d
│
├── 活性化 (Activation)
│   ├── KPI: 初回パイプライン実行完了率
│   │   └── 測定: inference_trace_logs (初回チェックイン → P判定完了)
│   ├── KPI: 初回 P2+ アラート受領 → 対応完了率
│   │   └── 測定: trace_logs.review_decision IS NOT NULL / P2+ count
│   └── KPI: 選手 Daily Input 開始率
│       └── 測定: daily_metrics records / active_athletes (7日以内)
│
├── エンゲージメント (Engagement)
│   ├── KPI: 選手チェックイン継続率（7日連続入力率）
│   │   └── 測定: daily_metrics streak analysis
│   ├── KPI: ダッシュボード DAU / MAU
│   │   └── 測定: アクセスログ
│   ├── KPI: 推奨アクション承認率 (ACCEPTED / total reviews)
│   │   └── 測定: trace_logs.review_decision = 'ACCEPTED'
│   ├── KPI: アセスメント完了数 / 週
│   │   └── 測定: conditioning_assessments.status = 'completed' GROUP BY week
│   ├── KPI: シミュレータ利用回数 / 週（S5以降）
│   │   └── 測定: simulator API call logs
│   └── KPI: 品質ゲート発動率（専門家委譲率）
│       └── 測定: trace_logs WHERE expert_review_required = true
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
    │   └── 測定: Stripe / subscriptions テーブル
    ├── KPI: ARPU（チーム当たり平均収益）
    │   └── 測定: MRR / active_organizations
    ├── KPI: プランアップグレード転換率
    │   └── 測定: Free→Standard / Standard→Pro 転換数
    └── KPI: Dunning回収率
        └── 測定: dunning_schedules 回収成功率
```

### KPI 測定ソースマッピング

| KPI カテゴリ | 主な測定ソース |
|-------------|--------------|
| 獲得 | Supabase Auth, Web Analytics, daily_metrics |
| 活性化 | inference_trace_logs, daily_metrics |
| エンゲージメント | inference_trace_logs, conditioning_assessments, アクセスログ |
| リテンション | subscriptions テーブル, アプリ内サーベイ, injury_records |
| 収益 | Stripe API, subscriptions, dunning_schedules |

---

## 4. 優先順位付きバックログ

### 凡例

- **担当エージェント**: @05-architect, @04-backend, @03-frontend, @06-data-engineer, @11-qa, @08-billing, @07-ml-engineer, @09-i18n
- **SP**: ストーリーポイント (フィボナッチ: 1, 2, 3, 5, 8, 13)
- **依存**: 先行タスクの #番号またはSprint番号

### Sprint 1 ✅ 完了 — SportProfile基盤 + Go推論エンジン

| # | タスク名 | 担当 | SP | 状態 |
|---|---------|------|-----|------|
| 1-1 | Go推論エンジン6ノードパイプライン（pace-inference/） | @05-architect | 13 | ✅ |
| 1-2 | TSフォールバック（同一ロジック） | @04-backend | 8 | ✅ |
| 1-3 | Go SportProfile実装（5競技） | @04-backend | 3 | ✅ |
| 1-4 | TS SportProfileミラー + configForSport() | @04-backend | 3 | ✅ |
| 1-5 | パイプラインAPI 競技別設定適用 | @04-backend | 3 | ✅ |
| 1-6 | DB: organizations.sport列追加 | @06-data-engineer | 2 | ✅ |
| 1-7 | Daily Input UI（Bio-Swipe） | @03-frontend | 5 | ✅ |
| 1-8 | ダッシュボード（基本） | @03-frontend | 5 | ✅ |
| 1-9 | RLSポリシー + inference_trace_logs | @06-data-engineer | 5 | ✅ |
| 1-10 | 品質ゲート + 傾向通知 + 段階的Z-Score | @04-backend | 5 | ✅ |

### Sprint 2 — アセスメント基盤 + DB（次回着手）

| # | タスク名 | 担当 | SP | 依存 | フェーズ |
|---|---------|------|-----|------|---------|
| 2-1 | DB: conditioning_assessments テーブル作成 | @06-data-engineer | 3 | — | S2 |
| 2-2 | DB: rehab_exercises, rehab_prescriptions テーブル作成 | @06-data-engineer | 3 | — | S2 |
| 2-3 | API: `GET /api/assessment/conditioning/{athleteId}` 3軸分析データ集約 | @04-backend | 5 | 2-1 | S2 |
| 2-4 | API: `POST /api/assessment/conditioning` アセスメント保存 | @04-backend | 3 | 2-1 | S2 |
| 2-5 | API: `GET /api/assessment/rehab/{athleteId}` リハビリアセスメントデータ | @04-backend | 3 | 2-2 | S2 |
| 2-6 | リハビリ種目マスタデータ投入 (seed) | @06-data-engineer | 2 | 2-2 | S2 |
| 2-7 | plan-gates に assessment/simulator Feature追加 | @08-billing | 2 | — | S2 |
| **計** | | | **21** | | |

### Sprint 3 — ダッシュボード強化 + アセスメントUI前半

| # | タスク名 | 担当 | SP | 依存 | フェーズ |
|---|---------|------|-----|------|---------|
| 3-1 | ダッシュボード: チーム負荷サマリーコンポーネント（ACWR平均/Monotony平均/負荷集中度） | @03-frontend | 5 | — | S3 |
| 3-2 | ダッシュボード: 要確認選手カード（推移ミニチャート + アセスメントボタン） | @03-frontend | 5 | — | S3 |
| 3-3 | ダッシュボード: リハビリ中選手セクション（Phase進捗/回復度/NRS推移） | @03-frontend | 3 | — | S3 |
| 3-4 | アセスメント Tab 1: 負荷集中分析（ACWR推移/Monotony/Strain/組織負担/Preparedness） | @03-frontend | 8 | S2 | S3 |
| 3-5 | アセスメント Tab 2: 運動効率分析（デカップリング/主観客観Gap/Z-Scoreレーダー/効率スコア） | @03-frontend | 8 | S2 | S3 |
| **計** | | | **29** | | |

### Sprint 4 — アセスメント完成 + シミュレータAPI

| # | タスク名 | 担当 | SP | 依存 | フェーズ |
|---|---------|------|-----|------|---------|
| 4-1 | アセスメント Tab 3: 疼痛パターン分析（NRS×負荷相関/ボディマップ/既往照合/代償パターン） | @03-frontend | 8 | S3 | S4 |
| 4-2 | アセスメント Tab 4: 総合評価（リスクサマリー/ベイズ事後確率/スタッフ所見/推奨アクション） | @03-frontend | 5 | S3 | S4 |
| 4-3 | API: `POST /api/simulator/conditioning` シナリオ比較エンジン | @04-backend | 8 | S2 | S4 |
| 4-4 | API: `POST /api/simulator/rehab` リハビリ種目シミュレーション | @04-backend | 8 | S2 | S4 |
| 4-5 | リハビリアセスメントUI（回復進捗バー/復帰基準チェック/Phase移行判定） | @03-frontend | 5 | S2 | S4 |
| 4-6 | 法的免責事項コンポーネント + 人間承認フローUI（P1-P2承認ゲート） | @03-frontend | 5 | 4-2 | S4 |
| **計** | | | **39** | | |

### Sprint 5 — シミュレータUI

| # | タスク名 | 担当 | SP | 依存 | フェーズ |
|---|---------|------|-----|------|---------|
| 5-1 | コンディショニング・シミュレータUI（シナリオ設定/ACWR-Monotony推移チャート/判定シミュレーション/Sweet Spot復帰予測） | @03-frontend | 13 | S4 | S5 |
| 5-2 | リハビリ・シミュレータUI（種目追加除外/組織負荷チャート/復帰基準達成予測/再受傷リスク推移） | @03-frontend | 13 | S4 | S5 |
| 5-3 | シミュレータ → アセスメント連携（シナリオ採用 → 評価に反映） | @04-backend | 3 | 5-1, 5-2 | S5 |
| **計** | | | **29** | | |

### Sprint 6 — AI補助 + 統合テスト

| # | タスク名 | 担当 | SP | 依存 | フェーズ |
|---|---------|------|-----|------|---------|
| 6-1 | AI SOAP補助: S/O構造化 + A鑑別リスト + P計画生成（Gemini 2.0 Flash, Pro限定） | @07-ml-engineer | 8 | S4 | S6 |
| 6-2 | AI 総合評価サジェスト（Tab 4, 採用/修正/無視の3択） | @07-ml-engineer | 5 | S4 | S6 |
| 6-3 | AI 介入提案（シミュレータ推奨ロジック, Pro限定） | @07-ml-engineer | 5 | S5 | S6 |
| 6-4 | E2E テスト: アセスメントフロー全体（Active + Rehab） | @11-qa | 5 | S5 | S6 |
| 6-5 | E2E テスト: シミュレータフロー全体（コンディショニング + リハビリ） | @11-qa | 5 | S5 | S6 |
| 6-6 | PDF出力（Pro限定） | @03-frontend | 3 | 6-1 | S6 |
| **計** | | | **31** | | |

### Sprint 7 — ログインURL分離 + 選手セルフサインアップ + ロール切替

| # | タスク名 | 担当 | SP | 依存 | フェーズ |
|---|---------|------|-----|------|---------|
| 7-1 | DB: `team_invite_codes` テーブル + `platform_admins` テーブル + RLSヘルパー `is_platform_admin()` | @06-data-engineer | 5 | — | S7 |
| 7-2 | ミドルウェア改修: ログインURL分離 + ロール判定 + リダイレクト制御 | @05-architect | 8 | — | S7 |
| 7-3 | 認証コールバック改修: platform_admins チェック + login_context セッションフラグ | @04-backend | 5 | 7-1 | S7 |
| 7-4 | 選手ログイン画面 (`/auth/athlete-login`): Magic Link UI + 新規登録 + チームコード入力フロー + 注意喚起 | @03-frontend | 8 | 7-2 | S7 |
| 7-5 | 管理者ログイン画面 (`/auth/admin-login`): シンプルUI | @03-frontend | 3 | 7-2 | S7 |
| 7-6 | 既存スタッフログイン改修: 選手誘導リンク追加 | @03-frontend | 2 | — | S7 |
| 7-7 | チームコード管理API: CRUD + 有効期限/使用回数制限 (`/api/admin/team-codes`) | @04-backend | 5 | 7-1 | S7 |
| 7-8 | チームコード管理UI: master向け管理画面 | @03-frontend | 5 | 7-7 | S7 |
| 7-9 | ヘッダーロール切替トグル: スタッフ↔選手ビュー切替（選手ログインからは不可） | @03-frontend | 5 | 7-3 | S7 |
| 7-10 | E2E テスト: ログイン分離 + セルフサインアップ + ロール切替 | @11-qa | 5 | 7-4,7-9 | S7 |
| **計** | | | **51** | | |

### Sprint 8 — プラットフォーム管理画面（優先度1-2: 決済・チーム・プラン）

| # | タスク名 | 担当 | SP | 依存 | フェーズ |
|---|---------|------|-----|------|---------|
| 8-1 | DB: `plan_change_requests` テーブル + `platform_admin_audit_logs`(WORM) + 集計ビュー4種 | @06-data-engineer | 8 | 7-1 | S8 |
| 8-2 | プラットフォーム管理画面レイアウト: サイドバー + ヘッダー + 認可ガード | @03-frontend | 5 | 7-2 | S8 |
| 8-3 | API: `/api/platform-admin/billing` — Stripe請求サマリー + MRR推移 | @04-backend | 8 | 8-1 | S8 |
| 8-4 | API: `/api/platform-admin/teams` — 契約チーム一覧 + プラン情報 | @04-backend | 5 | 8-1 | S8 |
| 8-5 | API: `/api/platform-admin/plan-change-requests` — プラン変更依頼CRUD | @04-backend | 5 | 8-1 | S8 |
| 8-6 | P1 ダッシュボード画面: 全体KPIカード（契約数・MRR・未払い・エラー・利用率） | @03-frontend | 5 | 8-3,8-4 | S8 |
| 8-7 | P2 決済状況画面: Stripe請求テーブル + MRR推移チャート + 未払い/Dunning | @03-frontend | 8 | 8-3 | S8 |
| 8-8 | P3 契約チーム+プラン管理画面: チーム一覧 + プラン詳細 + 変更依頼管理 | @03-frontend | 8 | 8-4,8-5 | S8 |
| 8-9 | Stripe連携拡張: platform_admin向け請求データ集約 + Dunningステータス取得 | @08-billing | 5 | 8-3 | S8 |
| 8-10 | E2E テスト: P1-P3 + プラン変更依頼フロー | @11-qa | 5 | 8-6,8-7,8-8 | S8 |
| **計** | | | **62** | | |

### Sprint 9 — プラットフォーム管理画面（優先度3-5: エラー・エンジン・利用率・成長率）

| # | タスク名 | 担当 | SP | 依存 | フェーズ |
|---|---------|------|-----|------|---------|
| 9-1 | API: `/api/platform-admin/errors` — Sentry連携 + APIエラー率集計 | @04-backend | 5 | 8-1 | S9 |
| 9-2 | API: `/api/platform-admin/engine` — Go/TS切替状況 + レイテンシ + Shadow Mode | @04-backend | 5 | 8-1 | S9 |
| 9-3 | API: `/api/platform-admin/usage` — DAU/MAU + チェックイン率 | @04-backend | 5 | 8-1 | S9 |
| 9-4 | API: `/api/platform-admin/engine-growth` — データ蓄積量 + 推論精度 + データ品質 | @04-backend | 5 | 8-1 | S9 |
| 9-5 | P4 システムエラー画面: エラー率チャート + エラー一覧 + エンジン稼働状況 | @03-frontend | 5 | 9-1 | S9 |
| 9-6 | P5 推論エンジン監視画面: Go/TS切替 + レイテンシチャート + Shadow Mode結果 | @03-frontend | 5 | 9-2 | S9 |
| 9-7 | P6 利用率画面: DAU/MAU + チェックイン率 + 機能別利用率 | @03-frontend | 5 | 9-3 | S9 |
| 9-8 | P7 エンジン成長率画面: データ蓄積量 + 推論精度推移 + データ品質スコア（契約チームとは別画面） | @03-frontend | 5 | 9-4 | S9 |
| 9-9 | セキュリティ監査: platform_admin RLS + 情報秘匿性テスト + 監査ログ検証 | @12-security | 5 | 9-5,9-6,9-7,9-8 | S9 |
| 9-10 | E2E テスト: P4-P7 + platform_admin全画面フロー | @11-qa | 5 | 9-5,9-6,9-7,9-8 | S9 |
| **計** | | | **50** | | |

### 全体サマリー

| Sprint | 内容 | SP | 状態 |
|--------|------|-----|------|
| **S1** | SportProfile基盤 + Go推論エンジン + Daily Input + ダッシュボード基本 | — | ✅ 完了 |
| **S2** | アセスメント基盤 + DB + Feature Gate | 21 | **次回着手** |
| **S3** | ダッシュボード強化 + アセスメントUI前半 | 29 | — |
| **S4** | アセスメント完成 + シミュレータAPI + 法的セーフガード | 39 | — |
| **S5** | シミュレータUI | 29 | — |
| **S6** | AI補助 + 統合テスト + PDF出力 | 31 | — |
| **S7** | ログインURL分離 + 選手セルフサインアップ + ロール切替 | 51 | — |
| **S8** | プラットフォーム管理画面（決済・チーム・プラン） | 62 | — |
| **S9** | プラットフォーム管理画面（エラー・エンジン・利用率・成長率） | 50 | — |
| **合計 (S2-S9)** | | **312 SP** | |

---

## 5. 意思決定ログ（v6.0 → v6.3 の重要変更）

### 排除したモデルとその代替

| 排除モデル | 排除理由（エビデンスレベル） | 代替実装 |
|-----------|--------------------------|---------|
| ODE損傷エンジン | Level 5（動物実験のみ） | EWMA-ACWR + GPS外部負荷 |
| EKFデカップリング | 学術論文ゼロ、偽陽性30% | ウェルネスZ-Score持続悪化パターン |
| Banister FFM | 統計的欠陥（Marchal 2025） | 複合Readinessスコア |
| Φ構造的脆弱性テンソル | Level 5（FEMベース） | 傷害歴リスク乗数 |
| Monotony単独トリガー | Level 2a否定的 | 補助情報（重み0.3） |

### アーキテクチャ変更

| 変更 | v6.0 (旧) | v6.3 (現) | 理由 |
|------|-----------|-----------|------|
| 推論エンジン | Python (Lambda/Cloud Functions) | Go (pace-inference/) + TSフォールバック | レイテンシ25x改善、メモリ600x改善 |
| 主要計算 | SciPy ODE + FilterPy EKF | EWMA/ACWR + Z-Score + ロジスティック回帰 | エビデンスレベル要件 |
| パイプライン実装 | lib/engine/v6/ (TS新設) | Go 6ノード + TS同一ロジック | デュアルエンジン構成 |
| Python依存 | SciPy, FilterPy, NumPy, NetworkX, EntropyHub | **なし**（Python マイクロサービス廃止） | Go移行により不要 |

---

## 付録A: リスクと緩和策

| リスク | 影響度 | 緩和策 |
|--------|-------|--------|
| Go推論エンジンの障害 | 高 | TSフォールバックで即時切替。Shadow Mode（1週間）→ カナリア10% → 50% → 100%。エラー率>5% or p99>3秒で自動ロールバック |
| アセスメントUI の複雑性（4タブ×2トラック） | 中 | Sprint 3-4 で段階的実装。Tab 1-2 を先行、Tab 3-4 を後続 |
| シミュレータの計算精度 | 中 | 既存APIの組み合わせ（v6/simulate + counterfactual/evaluate + dbn/simulate）で実現。新規数学モデルは追加しない |
| P1アラートの偽陽性による「アラート疲れ」 | 高 | 信頼区間閾値 (confidence > 0.80) + コンテキスト・オーバーライド + 品質ゲートの3層で精度担保 |
| AI SOAP補助の品質 | 中 | Gemini 3層ガード（サニタイズ→有害検出→出力検証）+ 採用/修正/無視の3択 + 判定ロジックへの影響ゼロ |
| プラン別機能ゲートの抜け漏れ | 中 | plan-gates.ts のcanAccess()で一元管理。E2Eテストで全プラン×全機能の組み合わせ検証 |
| チームコード漏洩による不正参加 | 高 | 有効期限（デフォルト7日）+ 使用回数制限 + master による即時無効化 + 注意喚起UI |
| platform_admin の情報秘匿性違反 | 高 | RLSで個別レコードアクセス禁止 + 集計ビューのみ公開 + セキュリティ監査(S9)で検証 |
| ログインURL分離による選手兼スタッフの混乱 | 中 | スタッフURLログイン時にトグル表示。選手URLからの権限昇格は技術的に不可能な設計 |
| プラン変更依頼の未処理滞留 | 中 | platform_admin ダッシュボードに未処理件数バッジ表示 + 3日超過アラート |

---

## 付録B: 下流エージェントへの伝達事項

| エージェント | 伝達内容 |
|-------------|---------|
| @05-architect | Go推論エンジンのShadow Mode/カナリアロールアウト設計、TSフォールバック切替機構 |
| @06-data-engineer | S2で conditioning_assessments / rehab_exercises / rehab_prescriptions 作成。55+マイグレーションとの整合性確認 |
| @04-backend | S2-S4でアセスメントAPI + シミュレータAPI。既存API（v6/simulate, counterfactual/evaluate, dbn/simulate, rts/predict）との連携 |
| @03-frontend | S3-S5でアセスメント4タブUI + シミュレータ2画面。プラン別Feature Gateの表示制御 |
| @07-ml-engineer | S6でGemini SOAP補助。3層ガードレール必須。判定ロジックへの影響ゼロを保証 |
| @08-billing | S2でplan-gates拡張。Free/Standard/Pro/Pro+CV/Enterpriseの全機能マトリクス |
| @11-qa | S6でE2Eテスト。パイプライン + アセスメント + シミュレータの統合テスト |
| @02-ui-ux | アセスメント4タブ + シミュレータ2画面のUI/UX仕様書が必要 |
| @03-frontend | S7: 選手ログイン画面 + 管理者ログイン画面 + スタッフログイン改修 + チームコード管理UI + ロール切替トグル |
| @03-frontend | S8-S9: P1-P7プラットフォーム管理画面（レイアウト + 7画面） |
| @04-backend | S7: 認証コールバック改修 + チームコードAPI + S8-S9: platform-admin API 8エンドポイント |
| @05-architect | S7: ミドルウェア改修（ログインURL分離 + ロール判定 + login_contextフラグ） |
| @06-data-engineer | S7: platform_admins + team_invite_codes テーブル、S8: plan_change_requests + 集計ビュー4種 + WORM監査ログ |
| @08-billing | S8: platform_admin向けStripe請求データ集約 + Dunningステータス取得 |
| @12-security | S9: platform_admin RLS検証 + 情報秘匿性テスト + チームコードセキュリティ監査 |

---

## 自律連鎖トリガー

```
プロダクト計画が v6.3 に更新されました。
@05-architect を呼び出します。
以下のバックログと技術要件を渡し、Sprint 2 の実装準備を開始させます。

【Sprint 2 バックログサマリー】
- DB: conditioning_assessments / rehab_exercises / rehab_prescriptions テーブル作成
- API: アセスメント3軸データ集約 + 保存 + リハビリデータ
- Feature Gate: plan-gates に assessment/simulator 追加
- 合計: 21 SP

【アーキテクチャ前提】
- Go推論エンジン（8ms）+ TSフォールバック（デュアル構成）
- Python マイクロサービスは廃止（ODE/EKF排除に伴い不要）
- 既存 55+ マイグレーションとの整合性確認必須
```
