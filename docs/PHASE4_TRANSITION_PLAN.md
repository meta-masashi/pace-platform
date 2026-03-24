# PACE Platform — Phase 4 移行計画

**作成日:** 2026-03-24
**ステータス:** 承認待ち
**前提:** Phase 1（Next.js + Supabase MVP）完了済み / Phase 2（Stripe課金・HealthKit連携・biomechanical_vectors有効化・v3.0 Active Mode）完了済み / Phase 3（Python CV Microservice・S3+SQS+ECS動画パイプライン・pgmpy DBN・CVオーバーレイUI・ARシルエットガイド・AWS ECS本番スケーリング）完了済み
**対象担当:** @01-pm（ビジネス設計） → @05-architect → @04-backend → @03-frontend

---

## 0. Phase 3 完了確認チェックリスト（Phase 4 移行ゲート）

Phase 4 着手前に以下がすべて満たされていること：

| 確認項目 | 確認方法 |
|---------|---------|
| CV 解析成功率 ≥ 85% の達成確認 | `SELECT COUNT(*) FILTER (WHERE status='completed') * 100.0 / COUNT(*) FROM realtime_cv_sessions` |
| CV 解析平均処理時間 ≤ 90秒の達成確認 | `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FROM realtime_cv_sessions WHERE status='completed'` |
| DBN 疲労アラート精度 ≥ 70% の達成確認 | fatigue_alerts に対するスタッフフィードバック集計 |
| AWS ECS Fargate GPU（g4dn.xlarge）本番稼働 | ECS サービス状態 + CloudWatch ログ確認 |
| CV 解析リクエスト 200本/月 の達成確認 | `SELECT COUNT(*) FROM realtime_cv_sessions WHERE created_at >= DATE_TRUNC('month', NOW())` |
| pgmpy DBN 週次再トレーニング稼働中 | GitHub Actions cron ジョブ履歴確認 |
| ADR-001〜016 全承認済み | `docs/adr/` ステータス欄 |
| SMPLify-X 商用ライセンス法務レビュー完了判断済み（ADR-004） | 法務部門確認書 or 継続延期の判断書 |
| CI（lint / typecheck / unit-tests / integration-tests / cv-docker-build / build）グリーン | GitHub Actions |
| 月間ARR 600万円（20チーム × Proプラン 30万円）達成 or 計画比 80% 以上 | Stripe Dashboard MRR |

---

## 1. ユーザーストーリーマップ

### アクター: Master（医師・医療責任者）

| ゴール | エピック | ユーザーストーリー | 優先度 | フェーズ |
|--------|----------|-------------------|--------|---------|
| CV料金プラン管理 | プラン戦略決定 | As a master, I want to subscribe to a CV analysis add-on plan separately from the Pro plan, so that I can control costs based on actual CV usage volume | Must | Phase 4 |
| CV料金プラン管理 | Enterprise契約 | As a master of a large organization (5+ teams), I want an Enterprise plan with multi-team management and volume pricing, so that I can consolidate billing across our organization | Must | Phase 4 |
| コンプライアンス管理 | HIPAA対応 | As a master at a US-based clinic, I want a signed BAA and HIPAA-compliant data handling documentation, so that we can legally use PACE Platform with PHI | Must | Phase 4 |
| コンプライアンス管理 | ISO 27001 準備 | As a master, I want evidence of ISO 27001 and SOC2 Type I audit progress, so that I can demonstrate due diligence to enterprise clients | Should | Phase 4 |
| 3D解析活用 | SMPLify-X 3Dメッシュ | As a master, I want to view 3D skeletal mesh overlays from SMPLify-X analysis, so that I can provide athletes with a more detailed and credible biomechanical report | Could | Phase 4 |
| チーム管理 | 多施設管理 | As a master managing multiple facilities, I want to view and manage all teams across facilities from a single dashboard, so that I can monitor organization-wide injury risk | Must | Phase 4 |

### アクター: AT / PT（トレーナー・理学療法士）

| ゴール | エピック | ユーザーストーリー | 優先度 | フェーズ |
|--------|----------|-------------------|--------|---------|
| チーム負荷管理 | DBN 疲労タイムライン集約 | As an AT, I want to view the DBN fatigue prediction timeline for all athletes on a single team-level dashboard, so that I can identify overload patterns across the squad before training sessions | Must | Phase 4 |
| チーム負荷管理 | 週次負荷サマリレポート | As an AT, I want to receive a weekly automated fatigue risk summary for the entire team, so that I can plan upcoming training intensity without manual data aggregation | Should | Phase 4 |
| 3D解析活用 | SMPLify-X 段階的移行 | As an AT, I want to see 3D mesh overlays for new CV analyses while keeping 2D stick figure history for older sessions, so that I can compare improved analysis quality without losing historical data | Could | Phase 4 |
| リアルタイムコーチング | ライブCV（将来） | As an AT, I want real-time movement feedback during training sessions via WebSocket streaming CV, so that I can provide immediate correction cues without post-session analysis delay | Could | Phase 4 |

### アクター: S&C（ストレングス＆コンディショニングコーチ）

| ゴール | エピック | ユーザーストーリー | 優先度 | フェーズ |
|--------|----------|-------------------|--------|---------|
| チーム負荷管理 | チームDBN集約ビュー | As an S&C, I want a consolidated view of all athletes' DBN fatigue scores and predicted risk timelines, so that I can adjust team training loads 1–2 weeks proactively | Must | Phase 4 |
| 負荷自動管理 | CV自動スケジューリング | As an S&C, I want to configure weekly automated CV analysis sessions (alarm → athlete records → auto-queue submission), so that I can maintain consistent biomechanical monitoring without manual coordination | Should | Phase 4 |
| 負荷自動管理 | アラート自動アクション | As an S&C, I want fatigue threshold alerts to automatically trigger a training load reduction recommendation, so that I can act faster without manually reviewing each alert | Could | Phase 4 |

### アクター: 選手（Athlete）

| ゴール | エピック | ユーザーストーリー | 優先度 | フェーズ |
|--------|----------|-------------------|--------|---------|
| 自己管理 | キネマティクス自己閲覧 | As an athlete, I want to see my own joint angles, CV error counts, and changes over time on the mobile app, so that I can understand my rehabilitation progress and stay motivated | Must | Phase 4 |
| 自己管理 | 疲労スコア自己確認 | As an athlete, I want to see my DBN fatigue score and recovery trend on the mobile app, so that I can self-manage training intensity on off days | Must | Phase 4 |
| 自動撮影 | CV解析自動スケジュール | As an athlete, I want to receive a scheduled reminder to record my movement video every week, so that I don't miss regular assessments and my biomechanical data stays current | Should | Phase 4 |

### アクター: Enterprise Admin（多施設管理者）

| ゴール | エピック | ユーザーストーリー | 優先度 | フェーズ |
|--------|----------|-------------------|--------|---------|
| 組織管理 | 多チーム統合管理 | As an enterprise admin, I want to create and manage multiple teams under a single organization account, so that I can control access, billing, and compliance centrally | Must | Phase 4 |
| 組織管理 | 組織間データ分離確認 | As an enterprise admin, I want confirmation that data from different teams is strictly isolated via RLS, so that I can meet enterprise security requirements | Must | Phase 4 |

---

## 2. MVPスコープ定義（Phase 4）

### 機能選定基準

- **収益直結性:** CV解析プラン分離・Enterpriseプラン新設はARR 1,200万円達成に直結。未実装では目標ARRの300万円分が未回収
- **ユーザー離脱防止:** 選手向けモバイルダッシュボード（キネマティクス自己確認）はPhase 3末時点でCVデータ蓄積量がゲートを超えた時点で初めて提供可能。提供しない場合、選手エンゲージメントが低下しチーム継続率に影響
- **技術的依存関係:** SMPLify-X は法務レビュー完了が前提（ADR-004）。リアルタイムコーチングはECS常時稼働移行が前提。これらは Phase 4 後半以降に条件付きで着手
- **コンプライアンスは商機:** HIPAA対応・BAA締結はUS医療機関への展開の前提条件。Enterprise契約の受注ブロッカー

### Phase 4 必須機能（Phase 1: Sprint 1〜3）

| 機能名 | 理由 / 除外した場合のビジネスリスク |
|--------|----------------------------------|
| **CV解析アドオンプラン新設（Stripe Product追加）** | Phase 3でProプランにCV解析をバンドルしてきたが、CV解析の単価が高く（ECS GPU コスト）、CV解析不要なチームへのProプラン価値低下を防ぐためにアドオン分離が必要。未分離のままでは ARR 300万円分の追加収益が取れない |
| **Enterpriseプラン新設（多施設・多チーム管理）** | 10チーム規模の大型組織からの問い合わせに対応できない。組織間RLSは既存Supabaseポリシーの拡張で実装可能。未実装では ARR 300万円の Enterprise 目標が未達 |
| **選手向けモバイルダッシュボード（キネマティクス・疲労スコア自己確認）** | Phase 3でCVデータが蓄積され、選手が自分のデータを見られない状態が継続すると、mobileアプリのDAUが低下し、チーム全体のデータ収集品質が劣化する |
| **チームレベル負荷管理AI（S&C向け・DBN集約タイムライン）** | Phase 3でDBN疲労予測は選手単体でのみ表示。S&Cの主要ワークフロー（チーム全体の負荷調整）に対応できないため、S&Cユーザーの解約リスクが高い |
| **HIPAA対応準備（BAA雛形作成・データフロー監査）** | US医療機関向けのEnterpriseセールスの前提条件。BAA未締結では引き合いがあってもクローズできない。第三者監査は Phase 4 後半だが、BAA締結・データフロー文書化はSprint 2〜3で対応可能 |

### Phase 4 後半以降（Sprint 4〜6 / 理由付き）

| 機能名 | Phase 4 前半で除外した理由 |
|--------|--------------------------|
| **SMPLify-X 本番稼働・3Dメッシュオーバーレイ** | ADR-004: 商用ライセンス法務レビューの完了が必須。Phase 4着手時点での法務完了状況による条件付き実装。Sprint 4 以降に着手予定 |
| **CV解析自動スケジューリング（定期撮影アラーム・週次自動キュー投入）** | Phase 4 前半でCV解析パイプライン安定稼働を確認した後、Sprint 4 以降で設計。自動化の前に手動フローの改善が必要 |
| **リアルタイム動作コーチング（WebSocket + ストリーミングCV）** | ECS常時稼働（非Spot）への移行が前提。Phase 4前半はSpot ECSを維持し、コスト試算後にSprint 5〜6で判断 |
| **ISO 27001 / SOC2 Type I 正式監査受審** | 第三者監査機関のスケジュール（通常3〜6ヶ月）の関係でPhase 4後半以降。HIPAA BAA先行、ISO/SOC2は後続 |

### スコープ外（Phase 4 全期間 / 理由付き）

| 機能名 | 除外理由 |
|--------|---------|
| Slack風コミュニティ完全実装 | Phase 2〜3 から継続除外。収益・トリアージ精度に非直結 |
| Google Calendar 双方向同期の高度化 | 基本実装済み（20260323_google_calendar_sync.sql）。追加スコープの収益直結性なし |
| カスタムAIモデルのfine-tuning（組織別） | 組織数・データ量が fine-tuning に必要な規模（数千件）に未達 |
| 動画の外部LMS連携（TeleHealth等） | 医療資格要件・規制上の追加審査が必要。Phase 5以降 |

---

## 3. KPIツリーと成功指標

```
最上位目標: Phase 4完了後 月間ARR 1,200万円
            内訳: 30チーム × Proプラン 30万円 = 900万円
                  10チーム × CVアドオン or Enterpriseプラン 30万円 = 300万円
│
├── 獲得KPI
│   ├── 月間新規組織登録数: 目標 8件/月
│   │   計測: organizations テーブル created_at の月次COUNT
│   │   Phase 4施策: Enterpriseプラン新設・HIPAA対応によるUS市場展開
│   ├── Enterprise プラン転換数: 目標 Phase 4 末で累計 10社
│   │   計測: organizations.plan = 'enterprise' の COUNT
│   ├── CV解析アドオン購入率（Proプラン組織のうち）: 目標 30%
│   │   計測: subscriptions WHERE plan_type = 'cv_addon' / organizations WHERE plan = 'pro'
│   └── Stripe Proプラン有料転換率: 目標 70%（Phase 3の65%から向上）
│       計測: organizations.plan = 'pro' / 全登録組織数
│
├── 活性化KPI（選手エンゲージメント）
│   ├── 選手モバイルDAU / MAU比率: 目標 ≥ 40%
│   │   計測: pace-mobile 日次アクティブユーザー / 月次アクティブユーザー
│   ├── キネマティクスダッシュボード閲覧率（選手）: 目標 ≥ 60%（CV解析完了後7日以内に閲覧）
│   │   計測: athlete_dashboard_views WHERE viewed_at <= cv_completed_at + interval '7 days'
│   ├── 疲労スコア自己確認率（選手）: 目標 ≥ 50%（週次チェックイン後の確認率）
│   │   計測: fatigue_score_views WHERE viewed_at BETWEEN checkin_at AND checkin_at + interval '1 day'
│   └── CV解析自動スケジュール利用率（Sprint 5〜6 追加後）: 目標 ≥ 40%
│       計測: cv_schedules WHERE auto_queued = true / total organizations
│
├── CV Engine KPI（Phase 3 継続・向上）
│   ├── CV解析成功率: 目標 ≥ 90%（Phase 3の85%から向上）
│   │   計測: realtime_cv_sessions WHERE status='completed' / 全セッション（AUTO_REJECT除外後）
│   ├── SMPLify-X 3D解析成功率（法務完了後・Sprint 4〜6）: 目標 ≥ 80%
│   │   計測: cv_sessions WHERE analysis_type = 'smplify_x' AND status = 'completed'
│   ├── CV解析リクエスト数: 目標 500本/月（Phase 3の200本から増加）
│   │   計測: realtime_cv_sessions の月次COUNT
│   └── CV Engine コスト / ARR 比率: 目標 ≤ 4%（Phase 3の5%から改善）
│       計測: AWS ECS + S3 月次コスト / Stripe MRR
│
├── DBN / チーム負荷管理 KPI
│   ├── チームDBN集約ビュー週次利用率（S&C）: 目標 ≥ 70%（週1回以上アクセス）
│   │   計測: team_dashboard_views WHERE user_role = 's&c' の週次COUNT
│   ├── DBN疲労アラート精度: 目標 ≥ 75%（Phase 3の70%から向上）
│   │   計測: アラートへのスタッフfeedback（thumbs_up / total）
│   └── 疲労アラートからトレーニング負荷調整への転換率: 目標 ≥ 50%
│       計測: training_adjustments WHERE triggered_by_alert = true / total fatigue_alerts
│
├── コンプライアンス KPI
│   ├── BAA 締結完了数: 目標 Phase 4 末で 5社
│   │   計測: compliance_documents WHERE doc_type = 'baa' AND status = 'executed'
│   ├── HIPAA 内部監査完了: 目標 Sprint 3 末までに完了
│   │   計測: audit_checklist の完了項目数 / 全項目数
│   └── SOC2 Type I 準備スコア（ギャップ分析後）: 目標 80%以上
│       計測: soc2_gap_analysis の対応済み項目 / 全項目
│
└── 収益KPI
    ├── 月次解約率（Churn Rate）: 目標 上限 3%/月（Phase 3の4%から改善）
    │   計測: Stripe Dashboard Subscription Cancellation
    ├── ARPU（組織あたり月次収益）: 目標 40万円（CVアドオン効果）
    │   計測: Stripe MRR / アクティブ組織数
    ├── CV アドオン ARPU: 目標 30万円/組織
    │   計測: cv_addon subscriptions MRR / cv_addon組織数
    └── Enterprise ARPU: 目標 60万円以上/組織（多チーム割引後）
        計測: Enterprise subscription MRR / enterprise組織数
```

### Phase 4 着手ゲート（定量）

| 指標 | 閾値 | 計測方法 |
|------|------|---------|
| Phase 3 CI 全ジョブ pass | 100% | GitHub Actions |
| ADR-001〜016 全承認 | 全ステータス「承認済み」 | docs/adr/ 確認 |
| CV解析成功率（Phase 3 達成値） | ≥ 85% | realtime_cv_sessions 集計 |
| AWS ECS 本番稼働確認 | ECS サービス RUNNING 状態 | CloudWatch |
| biomechanical_sessions 蓄積件数（選手ダッシュボード前提） | ≥ 1,000件/組織平均 | `SELECT AVG(cnt) FROM (SELECT organization_id, COUNT(*) cnt FROM biomechanical_sessions GROUP BY 1)` |
| SMPLify-X 法務レビュー完了判断 | 完了 or 延期決定 済み | 法務部門確認書 |

---

## 4. 優先順位付きバックログ（Phase 4）

工期目安: 12週間（Sprint 1〜6、各2週間）

### Sprint 1（Week 1-2）: CV アドオンプラン分離・Enterprise プラン基盤

| # | タスク名 | 担当エージェント | SP | 依存 | フェーズ |
|---|---------|----------------|----|----|---------|
| P4-01 | ADR-017: CV解析アドオンプラン料金設計（Proバンドル vs アドオン分離の最終決定・Stripe Product構造） | @05-architect | 3 | ADR-010 | Phase 4 |
| P4-02 | ADR-018: Enterpriseプラン設計（多チーム組織構造・RLS拡張方針・料金モデル） | @05-architect | 3 | なし | Phase 4 |
| P4-03 | DB Migration: `20260601_enterprise_orgs.sql`（organizations に parent_organization_id・plan_type='enterprise' カラム追加・teams テーブル新設）| @04-backend | 5 | P4-02 | Phase 4 |
| P4-04 | Stripe Product追加: CV解析アドオンプラン（cv_addon）・Enterpriseプラン（enterprise）定義 | @04-backend | 2 | P4-01 | Phase 4 |
| P4-05 | Stripe Webhook 拡張: cv_addon / enterprise プランのイベント処理追加（organizations.plan_type 更新） | @04-backend | 3 | P4-03, P4-04 | Phase 4 |
| P4-06 | DB Migration: `20260601_cv_addon_usage.sql`（cv_analysis_usage テーブル：月次解析本数トラッキング・アドオン上限管理） | @04-backend | 3 | P4-03 | Phase 4 |
| P4-07 | GitHub Secrets 追加: STRIPE_CV_ADDON_PRICE_ID / STRIPE_ENTERPRISE_PRICE_ID | @04-backend | 1 | P4-04 | Phase 4 |
| P4-08 | ADR-019: HIPAA対応・BAA締結・データフロー監査設計（技術要件整理） | @05-architect | 3 | なし | Phase 4 |

**Sprint 1 SP合計: 23**

### Sprint 2（Week 3-4）: 多チーム管理 UI・CV アドオン料金ゲート実装

| # | タスク名 | 担当エージェント | SP | 依存 | フェーズ |
|---|---------|----------------|----|----|---------|
| P4-09 | Enterprise: 多チーム管理 API（`/api/enterprise/teams`）実装: チーム作成・削除・メンバー割当・親組織からの一覧取得 | @04-backend | 5 | P4-03 | Phase 4 |
| P4-10 | Enterprise: 組織間データ分離 RLS 拡張（parent_organization_id による階層ポリシー追加）| @04-backend | 5 | P4-03 | Phase 4 |
| P4-11 | Staff Web App: Enterprise 管理ダッシュボード実装（`/enterprise/`）: 傘下チーム一覧・組織横断負傷リスクサマリ | @03-frontend | 8 | P4-09, P4-10 | Phase 4 |
| P4-12 | CV解析アドオン: 月次利用上限ゲート実装（middleware.ts 拡張: plan_type による CV 解析 API 呼び出し制限） | @04-backend | 3 | P4-05, P4-06 | Phase 4 |
| P4-13 | Staff Web App: 設定画面（/settings）プラン管理タブ拡張: CVアドオン購入フロー・Enterprise申請フォーム | @03-frontend | 5 | P4-12 | Phase 4 |
| P4-14 | HIPAA対応: データフロー文書化（audit_log テーブル作成・PHIアクセスログ記録 Edge Function） | @04-backend | 5 | P4-08 | Phase 4 |

**Sprint 2 SP合計: 31**

### Sprint 3（Week 5-6）: 選手向けモバイルダッシュボード・チームDBN集約

| # | タスク名 | 担当エージェント | SP | 依存 | フェーズ |
|---|---------|----------------|----|----|---------|
| P4-15 | DB Migration: `20260615_athlete_dashboard.sql`（athlete_dashboard_views テーブル・athlete_kpi_summary マテリアライズドビュー） | @04-backend | 3 | P4-03 | Phase 4 |
| P4-16 | 選手向けダッシュボード API（`/api/athlete/my-stats`）実装: 自身の kinematics エラーサマリ・疲労スコア・CV解析履歴（RLS: athletes は自身のデータのみ参照可） | @04-backend | 5 | P4-15 | Phase 4 |
| P4-17 | pace-mobile: 選手ダッシュボード画面実装（キネマティクスエラー推移グラフ・疲労スコアトレンド・CV解析履歴リスト） | @03-frontend | 8 | P4-16 | Phase 4 |
| P4-18 | pace-mobile: 疲労スコア自己確認 UI（DBN予測値の選手向け可視化・「今日の状態」サマリカード） | @03-frontend | 5 | P4-17 | Phase 4 |
| P4-19 | チームレベルDBN集約 API（`/api/team/fatigue-timeline`）: 全選手のDBN予測を時系列集約・チームリスクスコア算出 | @04-backend | 8 | Phase 3 DBN稼働 | Phase 4 |
| P4-20 | Staff Web App: S&C向けチームDBN集約ダッシュボード実装（チーム全体疲労タイムライン・リスク上位選手ハイライト） | @03-frontend | 8 | P4-19 | Phase 4 |
| P4-21 | HIPAA対応: BAA雛形作成・内部監査チェックリスト作成・エンタープライズ向け契約フロー整備 | @04-backend | 3 | P4-14 | Phase 4 |

**Sprint 3 SP合計: 40**

### Sprint 4（Week 7-8）: SMPLify-X 3D解析昇格（条件付き）・CV自動スケジューリング基盤

| # | タスク名 | 担当エージェント | SP | 依存 | フェーズ |
|---|---------|----------------|----|----|---------|
| P4-22 | SMPLify-X 法務レビュー完了判断: 完了の場合 ADR-004 更新・実装開始 / 未完了の場合 Phase 4 後半延期確認 | @05-architect | 2 | ADR-004 法務完了 | Phase 4 |
| P4-23 | **[条件付き: 法務完了時のみ]** CV Engine: SMPLify-X 統合（Docker イメージに smplify-x + SMPL モデル追加・推論スクリプト実装） | @04-backend | 8 | P4-22（法務完了時） | Phase 4 |
| P4-24 | **[条件付き: 法務完了時のみ]** CV Engine: MediaPipe 2D → SMPLify-X 3D 段階的移行ロジック（新規解析は3D・過去データは2D維持） | @04-backend | 5 | P4-23 | Phase 4 |
| P4-25 | **[条件付き: 法務完了時のみ]** Staff Web App: 3D メッシュオーバーレイ UI（Three.js WebGL + SMPLify-X kinematics_vector 可視化） | @03-frontend | 8 | P4-24 | Phase 4 |
| P4-26 | DB Migration: `20260701_cv_schedule.sql`（cv_schedules テーブル: 定期撮影設定・自動キュー投入設定） | @04-backend | 3 | Phase 3 CV基盤 | Phase 4 |
| P4-27 | CV解析自動スケジューリング: Supabase Edge Function（`/functions/cv-schedule-trigger`）実装（pg_cron 週次トリガー → SQS投入） | @04-backend | 5 | P4-26 | Phase 4 |
| P4-28 | pace-mobile: CV解析定期撮影アラーム実装（expo-notifications 週次プッシュ通知 → 撮影画面への直接遷移） | @03-frontend | 5 | P4-27 | Phase 4 |

**Sprint 4 SP合計（法務完了時）: 36 / SP合計（法務未完了時: P4-23〜25除外）: 15**

### Sprint 5（Week 9-10）: リアルタイムコーチング基盤・ECS常時稼働移行判断

| # | タスク名 | 担当エージェント | SP | 依存 | フェーズ |
|---|---------|----------------|----|----|---------|
| P4-29 | ADR-020: ECS 常時稼働 vs Spot 継続の判断（月間処理数・コスト分岐点分析）・リアルタイムCV アーキテクチャ設計 | @05-architect | 3 | Phase 3 ECS稼働実績 | Phase 4 |
| P4-30 | **[条件付き: ECS常時稼働移行決定時のみ]** ECS タスク定義更新: Spot → On-Demand 移行・最小稼働タスク数 = 1 設定 | @04-backend | 3 | P4-29（移行決定時） | Phase 4 |
| P4-31 | **[条件付き: ECS常時稼働移行決定時のみ]** WebSocket CV ストリーミング API 実装（FastAPI WebSocket + OpenCV フレーム解析 + Supabase Realtime ブリッジ） | @04-backend | 13 | P4-30 | Phase 4 |
| P4-32 | **[条件付き: ECS常時稼働移行決定時のみ]** pace-mobile: リアルタイムコーチング UI（WebSocket接続・フレームごとのフィードバック表示・遅延 < 500ms目標） | @03-frontend | 13 | P4-31 | Phase 4 |
| P4-33 | チームDBN集約: 週次負荷サマリレポート自動生成（PDF/メール配信 Edge Function）| @04-backend | 5 | P4-19 | Phase 4 |
| P4-34 | 防壁3（コスト保護）: CV アドオン利用量超過アラート実装（月次上限90%到達時にmasterへ通知） | @04-backend | 3 | P4-06 | Phase 4 |
| P4-35 | ADR-021: ISO 27001 / SOC2 Type I ギャップ分析・対応ロードマップ策定 | @05-architect | 3 | P4-08, P4-14 | Phase 4 |

**Sprint 5 SP合計（リアルタイムCV実装時）: 43 / SP合計（実装なし時: P4-30〜32除外）: 14**

### Sprint 6（Week 11-12）: E2Eテスト・セキュリティ強化・リリース

| # | タスク名 | 担当エージェント | SP | 依存 | フェーズ |
|---|---------|----------------|----|----|---------|
| P4-36 | 防壁1（モック排除）: CVアドオンプランゲート統合テスト（実Stripeアドオン購入 → CV API制限動作確認）| @04-backend | 5 | P4-12 | Phase 4 |
| P4-37 | 防壁2（AIセキュリティ）: 選手ダッシュボードAPIのプロンプトインジェクション耐性テスト + RLS越境アクセス禁止確認 | @04-backend | 3 | P4-16 | Phase 4 |
| P4-38 | 防壁4（耐障害性）: CV自動スケジューリングのSQS DLQ設定・失敗時リトライ・アラート通知 | @04-backend | 3 | P4-27 | Phase 4 |
| P4-39 | E2Eテスト: Enterprise多チーム管理フロー（組織作成 → チーム追加 → RLS分離確認 → Enterprise課金）| @03-frontend | 8 | P4-11 | Phase 4 |
| P4-40 | E2Eテスト: 選手ダッシュボード表示フロー（CV解析完了 → biomechanical_sessions → モバイルダッシュボード反映）| @03-frontend | 5 | P4-17 | Phase 4 |
| P4-41 | E2Eテスト: チームDBN集約タイムライン表示（全選手DBN集計 → S&C向けダッシュボード表示）| @03-frontend | 5 | P4-20 | Phase 4 |
| P4-42 | deploy.yml 拡張: Phase 4 DB マイグレーション自動適用ステップ追加 | @04-backend | 2 | P4-03, P4-06, P4-15, P4-26 | Phase 4 |
| P4-43 | Phase 4 リリースノート + ADR-017〜021 最終承認・PHASE4_TRANSITION_PLAN 完了マーク | @01-pm | 2 | 全P4 | Phase 4 |

**Sprint 6 SP合計: 33**

### Sprint 別ストーリーポイント合計

| Sprint | SP合計（通常）| SP合計（最大: 条件付き含む）| 主要リスク |
|--------|-------------|--------------------------|----------|
| Sprint 1 | 23 SP | 23 SP | ADR-017/018 設計決定の遅延（プラン料金の意思決定が未確定） |
| Sprint 2 | 31 SP | 31 SP | RLS階層ポリシーの設計複雑度（Enterprise組織間データ分離） |
| Sprint 3 | 40 SP | 40 SP | 選手ダッシュボードのRLSバグ（選手が他チームのデータを見えてしまうリスク） |
| Sprint 4 | 15 SP | 36 SP | SMPLify-X 法務レビュー未完了時は P4-23〜25（21SP）を次スプリントへ |
| Sprint 5 | 14 SP | 43 SP | リアルタイムCV（P4-31〜32: 26SP）はECS常時稼働移行決定が前提 |
| Sprint 6 | 33 SP | 33 SP | E2EテストにおけるEnterprise RLSの検証工数（多チーム構成の複雑さ） |
| **合計** | **156 SP（ベース）** | **206 SP（全条件付き実装時）** | |

---

## 5. 技術設計追記事項（新規 ADR 要件）

### ADR-017（新規作成要）: CV解析アドオンプラン料金設計

**意思決定が必要な事項:**
- CV解析のProプランへのバンドル継続 vs アドオン分離の最終決定
  - バンドル継続の場合: Pro → Pro+ へのプラン名称変更・料金改定
  - アドオン分離の場合: cv_addon_price_id の設定・月次解析本数上限の設定（例: 50本/月）
- CV解析アドオンの月次上限超過時の挙動（追加課金 vs 解析ブロック）
- Proプラン（CV非利用組織）の価格調整（現行30万円 → 継続 or 値下げ）

**主要制約:**
- ADR-010（Stripe Webhook セキュリティ）の署名検証・冪等性設計を継承
- 既存Pro顧客への移行通知は最低60日前に実施（Stripe利用規約上の要件）

### ADR-018（新規作成要）: Enterpriseプラン設計・多チーム組織構造

**意思決定が必要な事項:**
- organizations テーブルの階層設計（parent_organization_id 自己参照 vs 別途enterprise_accounts テーブル）
- RLS の階層ポリシー実装方針（Supabase のポリシーは関数呼び出し可能なため WITH CHECK 句での再帰的チェック）
- Enterprise管理者権限のロール設計（enterprise_admin ロール追加 vs master ロール拡張）
- 組織横断データ集計の許可範囲（Enterprise adminは全チームを参照可能だが、チーム間の選手データは分離維持）

**主要制約:**
- ADR-002 の API レイヤー分離方針を遵守
- 既存 organizations テーブルの master / at / s_and_c ロール設計（ADR-001）との後方互換性確保

### ADR-019（新規作成要）: HIPAA対応・BAA締結・データフロー監査設計

**意思決定が必要な事項:**
- PHI（Protected Health Information）の定義範囲（PACE Platformでは: 選手氏名・診断情報・cv_sessions動画 が該当）
- audit_log テーブルの設計（PHIアクセスごとの記録: user_id・accessed_resource・timestamp・IP・action_type）
- 暗号化要件: 現行Supabaseの保存時暗号化（AES-256）で十分かの評価 + 転送時TLS 1.3確認
- バックアップ・復旧手順のHIPAA要件への適合確認（RTO/RPO目標設定）
- BAA締結が必要なサブプロセッサーの洗い出し（Supabase / AWS / Stripe / Google / Vercel）

**主要制約:**
- ADR-008（動画保持ポリシー: raw_videos 7日削除）はHIPAA最小保持期間要件との整合性確認が必要
- audit_log はRLS対象外（管理者のみアクセス可）とし、Edge Function経由でのみ書き込み

### ADR-020（新規作成要）: ECS 常時稼働 vs Spot 継続・リアルタイムCVアーキテクチャ設計

**意思決定が必要な事項:**
- 移行トリガー: 月間CV解析処理数が何本を超えたらOn-Demand常時稼働がコスト優位か（試算ベース）
- WebSocket CV ストリーミングの技術選定（FastAPI WebSocket vs AWS API Gateway WebSocket vs Kinesis Video Streams）
- リアルタイムCV の許容レイテンシ目標（< 500ms / < 1秒 / < 3秒）
- ライブCVセッション中の課金モデル（時間課金 vs セッション課金 vs Proプラン無制限）

**主要制約:**
- Phase 3（ADR-015）のECS Spot + SQS 従量課金アーキテクチャとの共存期間の設計が必要
- リアルタイムCVはECS常時稼働が前提のため、ADR-020 での判断なしに P4-31〜32 は着手不可

### ADR-021（新規作成要）: ISO 27001 / SOC2 Type I ギャップ分析・対応ロードマップ

**意思決定が必要な事項:**
- 認証取得の優先順位（HIPAA BAA先行 → SOC2 Type I → ISO 27001 の順序）
- 審査機関の選定（SOC2: Big4 系 vs 専門機関）
- ギャップ分析の実施方法（内部実施 vs 外部コンサル）
- 認証取得目標時期（Phase 5 と連動）

---

## 6. CI/CD パイプライン拡張仕様

### ci.yml への追加事項

```yaml
# Phase 4 追加: 環境変数
env:
  STRIPE_CV_ADDON_PRICE_ID: ${{ secrets.STRIPE_CV_ADDON_PRICE_ID }}
  STRIPE_ENTERPRISE_PRICE_ID: ${{ secrets.STRIPE_ENTERPRISE_PRICE_ID }}

# Phase 4 追加: Enterprise RLS テスト
enterprise-rls-tests:
  name: Enterprise RLS Isolation Tests
  runs-on: ubuntu-latest
  needs: unit-tests
  # 多テナント間データ分離のRLSポリシー統合テスト
  # parent_organization_id による階層アクセス制御の動作確認

# Phase 4 追加: HIPAA audit_log テスト
hipaa-audit-tests:
  name: HIPAA Audit Log Tests
  runs-on: ubuntu-latest
  needs: unit-tests
  # PHIアクセス時のaudit_log記録確認テスト
```

### deploy.yml への追加事項

```yaml
# Phase 4 追加: DBマイグレーション自動適用
- name: Run DB Migrations (Phase 4)
  env:
    SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
    SUPABASE_PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID }}
  run: |
    npx supabase db push --project-ref $SUPABASE_PROJECT_ID
  # 対象: 20260601_enterprise_orgs.sql / 20260601_cv_addon_usage.sql /
  #        20260615_athlete_dashboard.sql / 20260701_cv_schedule.sql

# Phase 4 条件付き: SMPLify-X Docker イメージ更新
- name: Update CV Engine (SMPLify-X)
  if: ${{ vars.SMPLIFY_LICENSE_APPROVED == 'true' }}
  run: |
    aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
    docker build -t pace-cv-engine:smplify ./pace-cv-engine
    docker push $ECR_REGISTRY/pace-cv-engine:smplify
    aws ecs update-service --cluster pace-cv --service cv-engine --force-new-deployment
```

### 追加が必要な GitHub Secrets / Variables

| Secret / Variable 名 | 説明 | 担当 |
|---------------------|-----|-----|
| `STRIPE_CV_ADDON_PRICE_ID` | CV解析アドオンプランの Stripe Price ID | master |
| `STRIPE_ENTERPRISE_PRICE_ID` | EnterpriseプランのStripe Price ID | master |
| `SMPLIFY_LICENSE_APPROVED` | GitHub Variable（`true` / `false`）: SMPLify-X 法務完了フラグ | @05-architect |
| `ECS_ALWAYS_ON` | GitHub Variable: `true` でOn-Demand常時稼働・`false` でSpot継続 | @04-backend |

---

## 7. DB マイグレーション計画（Phase 4）

新規作成するマイグレーションファイル一覧（ADR-003 命名規則準拠）:

| ファイル名 | 内容 | 実行方式 |
|-----------|------|---------|
| `20260601_enterprise_orgs.sql` | organizations に parent_organization_id・plan_type カラム追加・teams テーブル新設・Enterprise向けRLSポリシー追加 | 自動（deploy.yml） |
| `20260601_cv_addon_usage.sql` | cv_analysis_usage テーブル（月次解析本数・アドオン上限・組織別追跡） | 自動（deploy.yml） |
| `20260601_hipaa_audit_log.sql` | audit_log テーブル（PHIアクセス記録・user_id / resource / action / ip / timestamp）・RLS除外・Edge Function専用書き込み | 手動（Supabase Dashboard: RLS除外設定のため） |
| `20260615_athlete_dashboard.sql` | athlete_dashboard_views テーブル・athlete_kpi_summary マテリアライズドビュー（RLS: athletes は自身のレコードのみ参照可） | 自動（deploy.yml） |
| `20260701_cv_schedule.sql` | cv_schedules テーブル（定期撮影設定・pg_cron ジョブ設定・SQS自動投入フラグ） | 自動（deploy.yml） |
| `20260715_smplify_x_schema.sql` | **[条件付き: 法務完了時のみ]** biomechanical_sessions に analysis_type='smplify_x' カラム追加・3D kinematics_vector 次元拡張 | 手動（法務完了後に適用） |

---

## 8. 4大防壁チェック（Phase 4 版）

| 防壁 | Phase 4 での適用箇所 | 実装方針 |
|-----|-------------------|---------|
| **防壁1: モック実装の完全排除** | Enterprise プラン課金テスト・RLS多テナントテスト・CV自動スケジューリングSQSテスト | Stripe CLIの`stripe trigger`でEnterprise課金イベントをリアル発火。RLSテストは実Supabase環境で複数テナント作成して実行 |
| **防壁2: AIセキュリティ** | 選手ダッシュボードAPIへのプロンプトインジェクション対策・RLS越境アクセス禁止 | 選手向けAPIは athlete_id を JWT から取得し、クエリパラメータの athlete_id は無視（上書き防止）。ADR-009ガードレール継続適用 |
| **防壁3: コスト保護** | CVアドオン月次上限超過アラート・ECS常時稼働移行後のコスト増加監視 | cv_analysis_usage テーブルで月次利用本数をリアルタイム追跡。90%到達時にmasterへSlack/メール通知。ECS On-Demand移行後はAWS Budgetアラートを更新 |
| **防壁4: 耐障害性** | CV自動スケジューリングのSQS DLQ・SMPLify-X推論失敗時のMediaPipeフォールバック・Enterprise RLS設定ミス時の安全停止 | CV自動スケジューリング: SQS DLQ（最大3回リトライ後）+ アラート通知。SMPLify-X失敗 → MediaPipe 2Dに自動フォールバック（analysis_type降格）。RLSポリシーエラー → 403返却（データ漏洩なし） |

---

## 9. リスクと軽減策

| リスク | 影響度 | 発生確率 | 軽減策 |
|--------|--------|---------|--------|
| SMPLify-X 法務レビューが Phase 4 全期間中に完了しない | 中 | 中 | P4-22〜25（3Dメッシュ: 21SP）を除外してもベースラインSP（156SP）で主要目標は達成可能。Sprint 4〜5 の余剰SPを Enterprise 機能強化に転用 |
| Enterprise RLSの階層ポリシーにバグが混入しデータ漏洩リスク | 最高 | 低 | P4-10（RLS拡張）は@04-backendと@05-architectの共同レビュー必須。Sprint 2 終了時にセキュリティレビューゲートを設ける。E2Eテスト（P4-39）でRLS越境アクセスを必ず確認 |
| HIPAA BAA締結でサブプロセッサー（Supabase/Vercel）側の対応が遅延 | 高 | 中 | Supabase（BAA対応済み）・Vercel（Enterprise契約でBAA取得可）を早期確認。Sprint 1（P4-08）でサブプロセッサーリスト確定し、締結順序を策定 |
| CV解析アドオンプラン移行時に既存Pro顧客からの反発 | 高 | 中 | ADR-017で60日前通知ポリシーを策定。既存Pro顧客への移行特典（例: 初年度CVアドオン50%引き）を検討。Price 変更はGrandfathering方式を採用（既存契約は据え置き） |
| ECS常時稼働移行後のコスト増加がARR増加を上回る | 高 | 低 | ADR-020の分岐点試算を Sprint 5 着手前に必須実行。On-Demand ECS g4dn.xlarge の月次コスト（約30〜50万円/台）vs CV解析アドオンによる追加ARR（300万円）を比較してから意思決定 |
| 選手ダッシュボードのRLSバグ（選手が他選手のデータを閲覧可能） | 最高 | 低 | P4-16（API実装）では JWT の sub クレームから athlete_id を取得し、クエリパラメータは無視する実装を必須化。P4-37（防壁2テスト）で必ず越境アクセステストを実行 |
| DBN チーム集約の計算コストがSupabase Edge Function の実行制限（50ms）を超過 | 中 | 中 | P4-19（チームDBN集約API）はマテリアライズドビューを使用し、リアルタイム集計を回避。pg_cron で時間外に定期更新（Phase 3の mv_athlete_biomechanical_summary と同パターン） |

---

## 10. Phase 4 完了後の Phase 5 展望（参考）

Phase 4 の完了によって以下の基盤が整い、Phase 5 への移行が可能となる：

| Phase 5 候補機能 | Phase 4 での前提条件 |
|----------------|-------------------|
| グローバル展開（US・EU市場） | HIPAA BAA締結・ISO 27001 / SOC2 Type I 取得完了 |
| AI コーチング自動化（処方箋自動生成） | DBN 精度 ≥ 75% 達成・選手ダッシュボードDAU安定 |
| リハビリテーション効果の多施設比較研究支援 | Enterprise多施設管理稼働・HIPAA対応完了 |
| fine-tuning 済みカスタムAIモデル（組織別） | biomechanical_sessions ≥ 10,000件/組織 達成 |

---

## 自律連鎖トリガー

Phase 4 プロダクト計画が完成しました。
@05-architect を呼び出します。
以下のバックログと技術要件を渡し、Phase 4 の CI/CD パイプライン拡張・ADR-017〜021 の作成・Enterprise RLS 階層設計・SMPLify-X 条件付き統合アーキテクチャの設計・構築を開始させます。

**バックログサマリー（Phase 4 / 156〜206 SP / 12週間）:**
- Sprint 1 (23 SP): CV アドオン / Enterprise プラン Stripe 基盤 + HIPAA 設計（P4-01〜P4-08）
- Sprint 2 (31 SP): Enterprise 多チーム管理 API + RLS 拡張 + CV アドオンゲート（P4-09〜P4-14）
- Sprint 3 (40 SP): 選手向けモバイルダッシュボード + チーム DBN 集約 + BAA 雛形（P4-15〜P4-21）
- Sprint 4 (15〜36 SP): CV 自動スケジューリング + SMPLify-X 条件付き実装（P4-22〜P4-28）
- Sprint 5 (14〜43 SP): リアルタイム CV 条件付き + チームレポート自動生成（P4-29〜P4-35）
- Sprint 6 (33 SP): E2E テスト + セキュリティ強化 + リリース（P4-36〜P4-43）

**新規 ADR 作成依頼:**
- ADR-017: CV 解析アドオンプラン料金設計（Pro バンドル vs アドオン分離の最終決定）
- ADR-018: Enterprise プラン設計（多チーム組織構造・RLS 階層ポリシー・Enterprise Admin ロール）
- ADR-019: HIPAA 対応・BAA 締結・データフロー監査設計（PHI 定義・audit_log 設計）
- ADR-020: ECS 常時稼働 vs Spot 継続・リアルタイム CV アーキテクチャ設計
- ADR-021: ISO 27001 / SOC2 Type I ギャップ分析・対応ロードマップ策定

**前提制約:**
- 既存 ADR-001〜016 の変更は不可（Phase 4 は ADR-001 の「Phase 4 以降」区分に完全準拠）
- SMPLify-X 実装（P4-23〜25）は ADR-004 の法務完了フラグ確認後のみ着手可
- リアルタイム CV 実装（P4-30〜32）は ADR-020 の ECS 常時稼働移行決定後のみ着手可
- 全マイグレーションは冪等（IF NOT EXISTS / CREATE OR REPLACE）で記述
- Enterprise RLS 拡張（P4-10）は@04-backend と @05-architect の共同レビュー必須
