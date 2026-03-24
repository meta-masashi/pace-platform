# PACE Platform — Phase 5 移行計画

**作成日:** 2026-03-24
**ステータス:** 承認待ち
**前提:** Phase 1〜4 完了済み
- Phase 1: Next.js + Supabase MVP（認証・SOAP AI・Bayesian推論・基本ダッシュボード）
- Phase 2: Stripe課金・HealthKit/Google Fit連携・biomechanical_vectors有効化・v3.0 Active Mode
- Phase 3: Python CV Microservice（MediaPipe・顔マスキング）・S3+SQS+ECS動画パイプライン・pgmpy DBN疲労予測・LLM Context Injection強化・CVオーバーレイUI・ARシルエットガイド・AWS ECS本番スケーリング
- Phase 4: CV解析アドオンプラン（20万円/月・50本/月）・Enterpriseプラン（60万円/月・多チーム管理）・選手向けモバイルダッシュボード・チームDBN集約・HIPAA対応（BAA・PHI監査）・ADR-017〜021

**対象担当:** @01-pm（ビジネス設計） → @05-architect → @04-backend → @03-frontend

---

## 0. Phase 4 完了確認チェックリスト（Phase 5 移行ゲート）

Phase 5 着手前に以下がすべて満たされていること：

| 確認項目 | 確認方法 |
|---------|---------|
| CV解析成功率 ≥ 90% の達成確認 | `SELECT COUNT(*) FILTER (WHERE status='completed') * 100.0 / COUNT(*) FROM realtime_cv_sessions` |
| CV解析リクエスト 500本/月 の達成確認 | `SELECT COUNT(*) FROM realtime_cv_sessions WHERE created_at >= DATE_TRUNC('month', NOW())` |
| Enterprise プラン転換 累計10社達成確認 | `SELECT COUNT(*) FROM organizations WHERE plan_type = 'enterprise'` |
| HIPAA BAA 締結済み組織 5社以上 | `SELECT COUNT(*) FROM compliance_documents WHERE doc_type = 'baa' AND status = 'executed'` |
| 月間ARR 1,200万円（目標比 80% 以上: 960万円）達成 | Stripe Dashboard MRR |
| ADR-017〜021 全承認済み | `docs/adr/` ステータス欄 |
| SMPLify-X 商用ライセンス法務レビュー完了判断済み（ADR-004） | 法務部門確認書 or Phase 5 着手前の明示的延期決定 |
| ECS常時稼働 vs Spot 移行判断完了（ADR-020） | ADR-020 承認済み |
| ISO 27001 / SOC2 Type I ギャップ分析完了（ADR-021） | SOC2ギャップ分析スコア 80% 以上 |
| 月次解約率（Churn Rate）≤ 3%/月 | Stripe Dashboard |
| CI（lint / typecheck / unit-tests / integration-tests / cv-docker-build / build）グリーン | GitHub Actions |

---

## 1. ユーザーストーリーマップ

### アクター: Master（医師・医療責任者）

| ゴール | エピック | ユーザーストーリー | 優先度 | フェーズ |
|--------|----------|-------------------|--------|---------|
| 3D解析品質向上 | SMPLify-X 3D本番稼働 | As a master, I want all new CV analyses to use SMPLify-X 3D mesh instead of MediaPipe 2D, so that I can provide clinically credible biomechanical reports to athletes and referring physicians | Must | Phase 5 |
| 国際展開 | 英語UI・国際請求 | As a master at a US or EU medical institution, I want to use PACE Platform in English with invoices in USD/EUR, so that I can introduce the platform without language barriers or accounting friction | Must | Phase 5 |
| コンプライアンス昇格 | ISO 27001 / SOC2 受審 | As a master at a large enterprise, I want to see official ISO 27001 or SOC2 Type I audit certification, so that I can pass our procurement security review and get budget approval | Must | Phase 5 |
| API統合 | パブリック API 利用 | As a master at a hospital, I want a documented REST API and SDK to push PACE data into our EMR system, so that clinicians can see injury risk predictions without switching applications | Should | Phase 5 |
| 高度分析 | 組織AIモデル fine-tuning | As a master whose organization has collected thousands of CV sessions, I want a fine-tuned AI model specific to my athletes, so that injury predictions are more accurate than the generic model | Could | Phase 5 |

### アクター: AT / PT（トレーナー・理学療法士）

| ゴール | エピック | ユーザーストーリー | 優先度 | フェーズ |
|--------|----------|-------------------|--------|---------|
| リアルタイム指導 | WebSocket ストリーミング CV | As an AT, I want real-time movement feedback during training via WebSocket streaming CV, so that I can correct athlete technique immediately without waiting for post-session analysis | Must | Phase 5 |
| 週次報告効率化 | AIコーチングレポート自動生成 | As an AT, I want automatically generated weekly and monthly coaching reports in PDF format, so that I can reduce manual reporting time by 80% and share results with team management | Must | Phase 5 |
| 遠隔リハビリ | TeleHealth LMS連携 | As a PT, I want to push rehabilitation exercise videos to a TeleHealth platform, so that athletes can follow their recovery programs remotely with guided video content | Should | Phase 5 |
| データ拡充 | ウェアラブル拡張連携 | As an AT, I want to receive Garmin, WHOOP, and Oura ring data alongside existing HealthKit data, so that I have a complete picture of athlete readiness without manual data aggregation | Should | Phase 5 |

### アクター: S&C（ストレングス＆コンディショニングコーチ）

| ゴール | エピック | ユーザーストーリー | 優先度 | フェーズ |
|--------|----------|-------------------|--------|---------|
| リーグ横断分析 | コホート・ベンチマーキング | As an S&C, I want to compare my athletes' biomechanical metrics against anonymized benchmarks from similar-level teams in the league, so that I can identify relative strengths and deficiencies objectively | Should | Phase 5 |
| 自動コーチング | AIレポート自動配信 | As an S&C, I want to receive auto-generated team load and injury-risk summary reports every Monday morning, so that I can prepare the week's training plan without manual analysis | Must | Phase 5 |
| ウェアラブル活用 | 多デバイスデータ統合 | As an S&C, I want WHOOP recovery scores and Garmin sleep data integrated into the fatigue prediction model, so that my training load recommendations reflect both biomechanical and recovery data | Should | Phase 5 |

### アクター: 選手（Athlete）

| ゴール | エピック | ユーザーストーリー | 優先度 | フェーズ |
|--------|----------|-------------------|--------|---------|
| リアルタイムフィードバック | ライブコーチング受信 | As an athlete, I want real-time visual cues on my mobile screen during training, so that I can self-correct my movement immediately without waiting for post-session feedback | Must | Phase 5 |
| 自己改善 | 自動レポート受信 | As an athlete, I want to receive a weekly summary report of my performance trends via the mobile app and email, so that I stay informed about my progress without manually checking the dashboard | Should | Phase 5 |
| ウェアラブル連携 | Garmin / Oura 自動同期 | As an athlete, I want my Garmin watch and Oura ring data to automatically sync to PACE, so that my recovery and sleep quality are included in my fatigue score without manual upload | Should | Phase 5 |

### アクター: Enterprise Admin（多施設管理者）

| ゴール | エピック | ユーザーストーリー | 優先度 | フェーズ |
|--------|----------|-------------------|--------|---------|
| 調達・セキュリティ承認 | ISO 27001 / SOC2 認証提示 | As an enterprise admin, I want to provide auditors with ISO 27001 or SOC2 Type I certification documentation, so that our use of PACE Platform passes the corporate security review board | Must | Phase 5 |
| 組織特化AI | カスタム fine-tuning モデル | As an enterprise admin managing 10+ teams with 2,000+ CV sessions, I want a model fine-tuned on our organization's data, so that injury risk predictions are specific to our athletes' profiles | Could | Phase 5 |
| システム統合 | EMR / EHR API連携 | As an enterprise admin at a hospital system, I want PACE to integrate with our Epic or Cerner EMR via API, so that PACE insights appear in existing clinical workflows | Should | Phase 5 |

### アクター: サードパーティ開発者（API利用者）

| ゴール | エピック | ユーザーストーリー | 優先度 | フェーズ |
|--------|----------|-------------------|--------|---------|
| SDK統合 | パブリック API / SDK | As a developer at a sports analytics company, I want a documented REST API with SDK in Python and JavaScript, so that I can embed PACE injury risk scores into our own analytics dashboard | Should | Phase 5 |
| データ取得 | Webhook 配信 | As a developer, I want to receive real-time webhook events when CV analysis or fatigue alerts are generated, so that my system can react to PACE events without polling | Should | Phase 5 |

---

## 2. MVPスコープ定義（Phase 5）

### 機能選定基準

- **収益直結性:** 月間ARR 2,500万円（Phase 4目標ARR 1,200万円から+1,300万円増）の達成に直結する機能のみ Sprint 1〜3 に配置
- **ユーザー離脱防止:** Phase 4 末時点でリアルタイムコーチング・3D解析への需要が顧客インタビューで確認されている場合、これらの欠如が解約理由になる
- **技術的前提条件の充足:** SMPLify-X は法務レビュー完了が前提（ADR-004 更新必須）。リアルタイムコーチングは ECS 常時稼働への移行が前提（ADR-020 判断済み前提）
- **国際展開は Enterprise ARR の乗数効果:** US/EU 市場展開により Enterprise 単価（60万円→ $4,000〜$6,000/月相当）とパイプラインが拡大する
- **ISO 27001 / SOC2 は Enterprise 受注のブロッカー:** 大手病院・スポーツリーグとの Enterprise 契約において、第三者監査証明がない場合に購買承認が通らないケースが Phase 4 で顕在化

### Phase 5 必須機能（Sprint 1〜3）

| 機能名 | 理由 / 除外した場合のビジネスリスク |
|--------|----------------------------------|
| **SMPLify-X 3D解析本番稼働・3Dメッシュオーバーレイ** | Phase 4 から持ち越し。ADR-004 法務完了が前提。3D解析は CV Addon プランの価値差別化の核心。未実装では Phase 4 比で CV Addon プランの解約増リスクあり。ARR貢献: CV Addon 継続率維持（300万円/月の保護） |
| **リアルタイム動作コーチング（WebSocket + ストリーミング CV）** | Phase 4 から持ち越し。ECS 常時稼働移行が前提（ADR-020）。顧客インタビューで「リアルタイムフィードバックがあれば月額+10万円追加でも契約する」という意向を Phase 4 で確認済みの前提で計画。ARR貢献: Pro → Pro+RT アップセル 100万円/月（5チーム×20万円追加） |
| **ISO 27001 / SOC2 Type I 正式監査受審・認証取得** | Phase 4 から持ち越し。Enterprise 顧客10社のうち US 医療機関 3社が「SOC2なしでは本番稼働不可」と回答。認証なしでは ARR 600万円の Enterprise 部分が受注停滞するリスク |
| **AIコーチングレポート自動生成（週次・月次 PDF + メール配信）** | AT/PT・S&C の手動レポート工数削減は継続率に直結。AT インタビューで「週次レポート作成に 2〜3 時間かかっている」という課題が Phase 4 で確認された前提で計画。活性化 KPI（AT/PT 週次利用率）への直接貢献 |
| **国際展開基盤（英語 UI・USD/EUR 課金・GDPR 対応）** | Phase 5 ARR 2,500万円の達成には日本市場のみでは組織数の絶対数が不足する。US/EU 市場への展開が ARR 2,500万円達成の前提条件。Stripe 多通貨は既存インフラで対応可能。GDPR 対応は EU Enterprise 受注のブロッカー |

### Phase 5 後半以降（Sprint 4〜6 / 理由付き）

| 機能名 | Sprint 1〜3 で除外した理由 |
|--------|--------------------------|
| **パブリック API / SDK 提供** | EMR 連携等の API 需要は確認されているが、API の認証設計（OAuth 2.0）・レートリミット・課金モデル（API利用課金）の設計に 1 スプリント分の設計工数が必要。Sprint 1〜3 の中核機能実装後に着手が適切 |
| **カスタム AI モデル fine-tuning（組織別）** | fine-tuning に必要なデータ規模（1組織あたり 2,000件以上の CV セッション）に到達した組織が Phase 5 Sprint 3 末時点で存在するか不確実。データ量確認後に着手判断を行う |
| **ウェアラブル拡張（Garmin・WHOOP・Oura）** | HealthKit/Google Fit の利用率が Phase 4 末時点で目標比 60% 以下の場合、追加ウェアラブル連携の ROI が低い。Phase 4 末の利用実績確認後に優先度を再評価 |
| **リーグ横断コホート分析・ベンチマーキング** | 匿名化・集約データポリシーの法的確認（HIPAA 集合データ免除規定・個人識別不可能化要件）が必要。Phase 5 コンプライアンス体制確立後に設計 |
| **動画 LMS 連携（TeleHealth）** | Phase 4 から継続除外。医療資格要件（Telehealth 提供者要件）・規制上の追加審査（遠隔医療資格等）が未完了。ISO 27001/SOC2 取得後に再評価 |

### スコープ外（Phase 5 全期間 / 理由付き）

| 機能名 | 除外理由 |
|--------|---------|
| Slack 風コミュニティ完全実装 | Phase 2〜4 から継続除外。収益・ユーザー継続率に非直結。Slack 等の既存ツールで代替可能 |
| 独自 EMR/EHR システム構築 | API 連携（パブリック API Sprint 4〜6 で対応）で十分。独自 EMR 構築は医療機器認証が必要になる可能性があり Phase 5 スコープを大幅に超える |
| リハビリ動画コンテンツ制作・ライブラリ管理 | PACE Platform はデータ収集・分析 SaaS であり、コンテンツビジネスへの転換はコアコンピタンスと乖離する |
| 保険請求・診療報酬連携 | 医療費請求コードへの対応は規制・法務審査が膨大であり Phase 5 スコープを大きく超える。将来フェーズで専門パートナーとの連携を検討 |

---

## 3. KPIツリーと成功指標

```
最上位目標: Phase 5完了後 月間ARR 2,500万円
            内訳: 50チーム × Proプラン 30万円 = 1,500万円
                  15チーム × CVアドオン 20万円 = 300万円
                  10チーム × Enterpriseプラン 60万円 = 600万円
                  APIパブリックプラン 5社 × 20万円 = 100万円
│
├── 獲得KPI
│   ├── 月間新規組織登録数: 目標 12件/月（Phase 4の8件/月から増加）
│   │   計測: organizations テーブル created_at の月次 COUNT
│   │   Phase 5施策: 英語UI・国際展開・SOC2認証によるUS/EU市場開拓
│   ├── 国際（US/EU）新規組織登録数: 目標 Phase 5 末で累計 10社
│   │   計測: organizations WHERE country NOT IN ('JP') の COUNT
│   ├── Enterprise プラン転換数: 目標 Phase 5 末で累計 20社（Phase 4の10社から倍増）
│   │   計測: organizations.plan_type = 'enterprise' の COUNT
│   ├── API パブリックプラン契約数: 目標 Phase 5 末で 5社
│   │   計測: api_subscriptions テーブル COUNT（Sprint 4〜6 実装後）
│   └── Stripe プラン有料転換率: 目標 75%（Phase 4の70%から向上）
│       計測: organizations.plan != 'free' / 全登録組織数
│
├── 活性化KPI
│   ├── リアルタイムコーチング利用率（実装後）: 目標 ≥ 50%（CV Addon組織のうち）
│   │   計測: websocket_cv_sessions の月次 COUNT / cv_addon 組織数
│   │   閾値: ECS 常時稼働移行完了後 Sprint 2 末より計測開始
│   ├── AIレポート自動配信開封率: 目標 ≥ 60%（送信数に対する開封率）
│   │   計測: email_events WHERE event_type = 'open' / email_events WHERE event_type = 'send'
│   ├── 3D メッシュオーバーレイ閲覧率（SMPLify-X 実装後）: 目標 ≥ 70%
│   │   計測: cv_sessions WHERE analysis_type = 'smplify_x' AND overlay_viewed = true / 全完了セッション
│   ├── 国際ユーザー Day 7 継続率: 目標 ≥ 45%
│   │   計測: users WHERE country != 'JP' AND last_active > created_at + interval '7 days' / 登録数
│   └── ウェアラブル連携率（Sprint 4〜6 実装後）: 目標 ≥ 30%（Pro以上組織のうち）
│       計測: athlete_integrations WHERE provider IN ('garmin','whoop','oura') COUNT / total athletes
│
├── CV Engine KPI
│   ├── SMPLify-X 3D解析成功率: 目標 ≥ 85%（実装後 Sprint 2 末より計測）
│   │   計測: cv_sessions WHERE analysis_type = 'smplify_x' AND status = 'completed' / 全 SMPLify-X セッション
│   ├── リアルタイム CV 遅延: 目標 ≤ 500ms（フレーム処理〜クライアント受信）
│   │   計測: websocket_cv_sessions の frame_latency_p95 メトリクス（CloudWatch）
│   ├── CV解析リクエスト数: 目標 1,000本/月（Phase 4の500本から倍増）
│   │   計測: realtime_cv_sessions の月次 COUNT
│   └── CV Engine コスト / ARR 比率: 目標 ≤ 3%（Phase 4の4%から改善）
│       計測: AWS ECS + S3 月次コスト / Stripe MRR
│
├── コンプライアンス KPI
│   ├── SOC2 Type I 認証取得: 目標 Sprint 4 末（監査機関スケジュール依存）
│   │   計測: 監査機関発行の認証書取得日
│   ├── ISO 27001 ギャップ対応率: 目標 ≥ 95%（認証受審時）
│   │   計測: iso27001_gap_analysis の対応済み項目 / 全項目
│   ├── GDPR データ主体要求（DSR）対応SLA: 目標 30日以内の対応完了
│   │   計測: dsr_requests WHERE completed_at <= requested_at + interval '30 days' / 全 DSR
│   └── BAA 締結完了数（US医療機関）: 目標 Phase 5 末で累計 15社
│       計測: compliance_documents WHERE doc_type = 'baa' AND status = 'executed'
│
└── 収益KPI
    ├── 月次解約率（Churn Rate）: 目標 上限 2%/月（Phase 4の3%から改善）
    │   計測: Stripe Dashboard Subscription Cancellation
    ├── ARPU（組織あたり月次収益）: 目標 50万円（Phase 4の40万円から向上）
    │   計測: Stripe MRR / アクティブ組織数
    ├── NRR（Net Revenue Retention）: 目標 ≥ 120%
    │   計測: (当月MRR - チャーンMRR + アップセルMRR) / 前月MRR × 100
    └── LTV / CAC 比率: 目標 ≥ 5.0
        計測: ARPU × (1 / Churn Rate) / 顧客獲得コスト
```

### Phase 5 着手ゲート（定量）

| 指標 | 閾値 | 計測方法 |
|------|------|---------|
| Phase 4 CI 全ジョブ pass | 100% | GitHub Actions |
| ADR-017〜021 全承認 | 全ステータス「承認済み」 | docs/adr/ 確認 |
| CV解析成功率（Phase 4 達成値） | ≥ 90% | realtime_cv_sessions 集計 |
| Enterprise 累計転換数 | ≥ 8社（目標10社の 80%） | organizations WHERE plan_type = 'enterprise' |
| 月間ARR（Phase 4 達成値） | ≥ 960万円（目標1,200万円の 80%） | Stripe Dashboard MRR |
| ECS 常時稼働 vs Spot 移行判断完了（ADR-020） | 判断完了・ADR-020 承認済み | docs/adr/ADR-020 ステータス |
| SMPLify-X 法務レビュー完了 or Phase 5 延期確定 | 明示的な判断書存在 | 法務部門確認書 |
| SOC2 監査機関選定・契約完了 | 契約書締結済み | 監査機関との契約書 |

---

## 4. 優先順位付きバックログ（Phase 5）

工期目安: 12週間（Sprint 1〜6、各2週間）

**SP スコアリング基準（3軸評価）:**
- 収益直結性: 3点 = ARR に直接影響 / 2点 = 活性化・継続率に影響 / 1点 = 技術基盤
- ユーザー離脱防止: 3点 = 解約リスクを直接防止 / 2点 = 間接的に継続率向上 / 1点 = QoL 向上
- 技術的依存関係: 3点 = 後続タスクが多い / 2点 = 中程度 / 1点 = 独立タスク

---

### Sprint 1（Week 1-2）: 3D解析本番移行・SOC2監査準備・国際展開基盤設計

| # | タスク名 | 担当エージェント | SP | 依存タスク | フェーズ |
|---|---------|----------------|----|-----------|----|
| P5-01 | ADR-022: SMPLify-X 本番稼働設計（法務完了確認・商用ライセンス取得手順・ECS Docker イメージ更新方針・2D→3D 段階移行ロジック確定） | @05-architect | 3 | ADR-004 法務完了 | Phase 5 |
| P5-02 | ADR-023: リアルタイムコーチングアーキテクチャ設計（ECS 常時稼働 On-Demand 移行・FastAPI WebSocket + Supabase Realtime ブリッジ設計・フレームレート・遅延目標確定） | @05-architect | 3 | ADR-020 移行判断済み | Phase 5 |
| P5-03 | ADR-024: 国際展開技術設計（Next-intl 多言語対応・Stripe 多通貨設定・GDPR DPA テンプレート・データレジデンシー方針） | @05-architect | 3 | なし | Phase 5 |
| P5-04 | ADR-025: パブリック API / SDK 設計（OAuth 2.0 クライアント資格情報フロー・エンドポイント定義・API キー管理・レートリミット設計・Stripe API 課金モデル） | @05-architect | 3 | なし | Phase 5 |
| P5-05 | ADR-026: SOC2 / ISO 27001 監査対応ロードマップ（ADR-021 ギャップ分析結果を基に、監査機関選定・証拠収集計画・コントロール実装スケジュール策定） | @05-architect | 3 | ADR-021 承認済み | Phase 5 |
| P5-06 | CV Engine: SMPLify-X Docker イメージ更新（smplify-x ライブラリ + SMPL モデルファイル追加・CUDA 12.x 対応確認・ECS タスク定義更新） | @04-backend | 8 | P5-01 | Phase 5 |
| P5-07 | DB Migration: `20260801_smplify_x_schema.sql`（cv_sessions に analysis_type カラム追加・smplify_x_mesh_url・smplify_x_params JSON カラム追加・既存データ 2D として backfill） | @04-backend | 3 | P5-01 | Phase 5 |
| P5-08 | ECS タスク定義更新: On-Demand 最小稼働タスク = 1（Spot → On-Demand 移行・ALB ヘルスチェック間隔調整・CloudWatch アラート更新） | @04-backend | 3 | ADR-020 移行決定 | Phase 5 |

**Sprint 1 SP合計: 29**
**Sprint 1 主要リスク:** SMPLify-X 法務レビューが Sprint 1 開始前に未完了の場合、P5-01・P5-06・P5-07 を Sprint 2 に延期し、P5-08 を前倒しで着手する。ECS 常時稼働移行が未判断の場合も同様に P5-02・P5-08 を保留し、設計 ADR（P5-03〜P5-05）のみ Sprint 1 で完了させる。

---

### Sprint 2（Week 3-4）: SMPLify-X 推論実装・WebSocket CV 実装・国際展開 UI

| # | タスク名 | 担当エージェント | SP | 依存タスク | フェーズ |
|---|---------|----------------|----|-----------|----|
| P5-09 | CV Engine: SMPLify-X 推論スクリプト実装（MediaPipe 前処理 → Auto-Rejection → SMPLify-X 推論 → 3D メッシュ + キネマティクスパラメータ出力・失敗時 MediaPipe フォールバック） | @04-backend | 13 | P5-06, P5-07 | Phase 5 |
| P5-10 | CV Engine: MediaPipe 2D → SMPLify-X 3D 段階的移行ロジック（新規解析は 3D・過去データは 2D 維持・analysis_type フラグ管理） | @04-backend | 5 | P5-09 | Phase 5 |
| P5-11 | WebSocket CV: FastAPI WebSocket エンドポイント実装（`/ws/cv/realtime`・フレーム受信 → MediaPipe リアルタイム推論 → JSON フィードバック送信・接続管理・切断ハンドリング） | @04-backend | 13 | P5-08 | Phase 5 |
| P5-12 | WebSocket CV: Supabase Realtime ブリッジ実装（WebSocket フィードバックをリアルタイムチャンネルに中継・AT/PT がブラウザでリアルタイム確認できる仕組み） | @04-backend | 5 | P5-11 | Phase 5 |
| P5-13 | DB Migration: `20260815_i18n_schema.sql`（organizations に country・currency・locale カラム追加・i18n_preferences テーブル新設） | @04-backend | 2 | P5-03 | Phase 5 |
| P5-14 | Next.js: next-intl 導入・英語 / 日本語 翻訳ファイル作成（`/en` / `/ja` ルーティング・既存 UI テキスト全件翻訳ファイル化） | @03-frontend | 8 | P5-03, P5-13 | Phase 5 |
| P5-15 | Stripe 多通貨設定: USD / EUR / JPY 価格設定追加・Stripe Customer の currency 管理・請求書言語対応 | @04-backend | 3 | P5-03, P5-13 | Phase 5 |

**Sprint 2 SP合計: 49**
**Sprint 2 主要リスク:** P5-09（SMPLify-X 推論）は SP=13 の高工数タスク。推論精度が目標（3D解析成功率 ≥ 80%）に届かない場合は Sprint 3 に持ち越し、MediaPipe フォールバックを本番継続する。P5-11（WebSocket CV）も SP=13 であり、Sprint 2 の合計 SP が 49 と高いため、P5-12 を Sprint 3 に分割することを検討する。

---

### Sprint 3（Week 5-6）: 3D オーバーレイ UI・リアルタイムコーチング UI・SOC2 コントロール実装

| # | タスク名 | 担当エージェント | SP | 依存タスク | フェーズ |
|---|---------|----------------|----|-----------|----|
| P5-16 | Staff Web App: 3D メッシュオーバーレイ UI（Three.js WebGL + SMPLify-X kinematics_vector 可視化・回転/ズーム操作・2D 比較表示切替） | @03-frontend | 8 | P5-10 | Phase 5 |
| P5-17 | pace-mobile: リアルタイムコーチング UI（WebSocket 接続・フレームごとフィードバック表示・視覚的警告アニメーション・遅延 ≤ 500ms 目標） | @03-frontend | 13 | P5-11, P5-12 | Phase 5 |
| P5-18 | Staff Web App: AT/PT 向けリアルタイムモニタリング画面（Supabase Realtime チャンネル購読・選手の動作フィードバックをブラウザでリアルタイム確認） | @03-frontend | 8 | P5-12 | Phase 5 |
| P5-19 | SOC2 コントロール実装 (1): アクセス制御強化（MFA 強制・セッションタイムアウト設定・特権アクセス管理・Supabase Auth ポリシー強化） | @04-backend | 5 | P5-05 | Phase 5 |
| P5-20 | SOC2 コントロール実装 (2): 変更管理・証拠収集自動化（GitHub Actions CI/CD ログ保持・デプロイ承認フロー・変更ログ Supabase テーブル記録） | @04-backend | 5 | P5-05 | Phase 5 |
| P5-21 | SOC2 コントロール実装 (3): インシデント対応プロセス文書化・Supabase Edge Function によるセキュリティアラート自動通知（Slack / Email） | @04-backend | 3 | P5-19 | Phase 5 |
| P5-22 | AIコーチングレポート自動生成 API（`/api/reports/weekly-coaching`）: 週次 Gemini 2.0 Flash 呼び出し → 選手別コーチングサマリ生成・JSON 出力・防壁2（プロンプトインジェクション対策）適用 | @04-backend | 5 | Phase 4 DBN 稼働 | Phase 5 |
| P5-23 | AIレポート PDF 生成・メール配信（Edge Function: `/functions/report-delivery`）: Puppeteer/React-pdf → PDF 生成 → SendGrid / Resend 配信・週次 pg_cron スケジュール | @04-backend | 5 | P5-22 | Phase 5 |

**Sprint 3 SP合計: 52**
**Sprint 3 主要リスク:** P5-17（リアルタイムコーチング UI）は SP=13 かつ WebSocket 接続安定性に依存する。モバイルネットワーク環境での 500ms 遅延目標が達成できない場合は、フィードバック間隔を 1 秒/フレームに緩和して MVP リリースし、Sprint 5〜6 で最適化する。

---

### Sprint 4（Week 7-8）: パブリック API 実装・GDPR 対応・カスタム fine-tuning 基盤

| # | タスク名 | 担当エージェント | SP | 依存タスク | フェーズ |
|---|---------|----------------|----|-----------|----|
| P5-24 | DB Migration: `20260901_api_keys.sql`（api_keys テーブル・api_usage_logs テーブル・rate_limit_config テーブル新設） | @04-backend | 3 | P5-04 | Phase 5 |
| P5-25 | パブリック API: OAuth 2.0 クライアント資格情報フロー実装（Supabase Edge Function `/functions/oauth-token`・クライアント ID/シークレット検証・JWT 発行・スコープ管理） | @04-backend | 8 | P5-24 | Phase 5 |
| P5-26 | パブリック API: コアエンドポイント実装（`GET /v1/athletes`・`GET /v1/cv-sessions`・`GET /v1/fatigue-scores`・`POST /v1/cv-sessions`・RLS 経由での組織データ分離） | @04-backend | 8 | P5-25 | Phase 5 |
| P5-27 | パブリック API: レートリミット実装（防壁3: Supabase Edge Function 内でのリクエスト数チェック・超過時 429 レスポンス・組織別上限設定） | @04-backend | 3 | P5-26 | Phase 5 |
| P5-28 | パブリック API: Python / TypeScript SDK 生成（OpenAPI 仕様書 → openapi-generator-cli → SDK 自動生成・README・使用例作成） | @04-backend | 5 | P5-26 | Phase 5 |
| P5-29 | GDPR 対応: データ主体要求（DSR）対応機能実装（データ削除 API `/api/gdpr/delete`・データエクスポート API `/api/gdpr/export`・dsr_requests テーブル・30 日 SLA 管理） | @04-backend | 8 | P5-13 | Phase 5 |
| P5-30 | GDPR 対応: Cookie 同意管理・プライバシーポリシー英語版作成・DPA テンプレート整備 | @03-frontend | 5 | P5-03 | Phase 5 |
| P5-31 | Staff Web App: API キー管理画面（`/settings/api`）・API ドキュメント埋め込み（Swagger UI / Redoc）・使用量ダッシュボード | @03-frontend | 5 | P5-25, P5-26 | Phase 5 |
| P5-32 | カスタム fine-tuning 基盤: 組織別データ規模チェック API（`/api/ai/fine-tuning-eligibility`）・eligible 組織の確認・Vertex AI fine-tuning ジョブ設計（対象: CV キネマティクスデータ 2,000件以上の組織のみ） | @04-backend | 5 | Phase 4 CV 蓄積データ量確認 | Phase 5 |

**Sprint 4 SP合計: 50**
**Sprint 4 主要リスク:** P5-25（OAuth 2.0 実装）は API セキュリティの根幹であり、実装不備が防壁2（AIセキュリティ）違反に直結する。セキュリティレビュー工数を 2日 別途確保すること。P5-32（fine-tuning 基盤）は eligible 組織が Phase 5 Sprint 4 時点でゼロの場合、Sprint 6 に延期する。

---

### Sprint 5（Week 9-10）: ウェアラブル拡張・コホート分析・SOC2 監査受審

| # | タスク名 | 担当エージェント | SP | 依存タスク | フェーズ |
|---|---------|----------------|----|-----------|----|
| P5-33 | ADR-027: ウェアラブル拡張設計（Garmin Connect IQ API・WHOOP API・Oura Ring API 認証フロー・データ取得スコープ・既存 HealthKit/Google Fit との統一データモデル設計） | @05-architect | 3 | なし | Phase 5 |
| P5-34 | DB Migration: `20261001_wearable_integrations.sql`（athlete_wearable_integrations テーブル・wearable_data_raw テーブル・既存 biometric_data モデルへのマッピング設計） | @04-backend | 3 | P5-33 | Phase 5 |
| P5-35 | ウェアラブル連携: Garmin Connect IQ API 統合（OAuth 認証・アクティビティデータ取得・DBN 疲労モデルへの入力変換・Supabase Edge Function スケジュール同期） | @04-backend | 8 | P5-34 | Phase 5 |
| P5-36 | ウェアラブル連携: WHOOP API + Oura Ring API 統合（リカバリースコア・睡眠スコア取得・DBN 入力への変換・athlete_wearable_integrations テーブル更新） | @04-backend | 8 | P5-34 | Phase 5 |
| P5-37 | pace-mobile: ウェアラブル連携設定 UI（デバイス選択・OAuth 認証フロー・同期状態表示・リカバリースコア可視化カード） | @03-frontend | 5 | P5-35, P5-36 | Phase 5 |
| P5-38 | コホート分析 API: 匿名化・集約ベンチマーキング（HIPAA 集合データ免除規定準拠・組織横断キネマティクス統計・`/api/analytics/cohort-benchmark`） | @04-backend | 8 | P5-29（GDPR）, Phase 4 HIPAA | Phase 5 |
| P5-39 | Staff Web App: リーグ横断ベンチマーキング UI（組織の指標 vs 匿名集計パーセンタイル表示・スポーツ種別フィルタ・傷害リスク分布チャート） | @03-frontend | 5 | P5-38 | Phase 5 |
| P5-40 | SOC2 Type I 監査受審サポート: 証拠パッケージ提出（アクセスログ・変更管理ログ・インシデント記録・セキュリティポリシー文書化）・監査機関とのコミュニケーション対応 | @04-backend | 5 | P5-19, P5-20, P5-21 | Phase 5 |

**Sprint 5 SP合計: 45**
**Sprint 5 主要リスク:** P5-40（SOC2 監査受審）は監査機関のスケジュールに依存する外部依存タスク。Sprint 5 での受審が困難な場合も、証拠パッケージの整備は Sprint 5 中に完了させ、Sprint 6 以降の認証取得を目指す。P5-38（コホート分析）は GDPR・HIPAA の法的解釈が必要であり、法務確認後に実装着手すること。

---

### Sprint 6（Week 11-12）: カスタム fine-tuning・E2E テスト・セキュリティ強化・リリース

| # | タスク名 | 担当エージェント | SP | 依存タスク | フェーズ |
|---|---------|----------------|----|-----------|----|
| P5-41 | カスタム fine-tuning: Vertex AI Gemini fine-tuning ジョブ実装（eligible 組織の CV キネマティクスデータ → JSONL 変換 → Vertex AI fine-tuning API 呼び出し・モデルバージョン管理） | @04-backend | 8 | P5-32 | Phase 5 |
| P5-42 | カスタム fine-tuning: 組織別モデルルーティング（`/api/ai/inference` に organization_id による fine-tuned モデル vs ベースモデル分岐・防壁4: fine-tuning 失敗時のベースモデルフォールバック） | @04-backend | 5 | P5-41 | Phase 5 |
| P5-43 | 防壁1（モック排除）: SMPLify-X 3D 解析統合テスト（実 ECS GPU 環境での 3D 推論動作確認・MediaPipe フォールバック動作確認） | @04-backend | 5 | P5-10 | Phase 5 |
| P5-44 | 防壁2（AIセキュリティ）: パブリック API プロンプトインジェクション耐性テスト・OAuth トークン偽造テスト・RLS 越境アクセス禁止確認 | @04-backend | 5 | P5-26 | Phase 5 |
| P5-45 | 防壁3（コスト保護）: fine-tuning ジョブコスト上限設定（Vertex AI 予算アラート・組織別 fine-tuning リクエスト数制限・月次コストレポート自動生成） | @04-backend | 3 | P5-41 | Phase 5 |
| P5-46 | 防壁4（耐障害性）: WebSocket CV 切断時自動再接続・SMPLify-X タイムアウト時 MediaPipe フォールバック・API Webhook 失敗時リトライ（Exponential Backoff）・DLQ 監視 | @04-backend | 5 | P5-11, P5-09 | Phase 5 |
| P5-47 | E2E テスト: 3D 解析フロー（動画アップロード → SMPLify-X 推論 → 3D メッシュ表示 → キネマティクスレポート生成） | @03-frontend | 5 | P5-16 | Phase 5 |
| P5-48 | E2E テスト: リアルタイムコーチングフロー（モバイル WebSocket 接続 → フレーム送信 → フィードバック受信 → AT ブラウザ画面確認） | @03-frontend | 8 | P5-17, P5-18 | Phase 5 |
| P5-49 | E2E テスト: 国際展開フロー（英語 UI 確認 → USD 課金 → GDPR データ削除要求 → 30 日以内対応確認） | @03-frontend | 5 | P5-14, P5-15, P5-29 | Phase 5 |
| P5-50 | E2E テスト: パブリック API フロー（OAuth トークン取得 → コア API 呼び出し → レートリミット確認 → SDK 動作確認） | @03-frontend | 5 | P5-28 | Phase 5 |
| P5-51 | deploy.yml 拡張: Phase 5 DB マイグレーション自動適用・多言語ビルド確認ステップ追加 | @04-backend | 2 | P5-07, P5-13, P5-24, P5-34 | Phase 5 |
| P5-52 | Phase 5 リリースノート + ADR-022〜027 最終承認・PHASE5_TRANSITION_PLAN 完了マーク | @01-pm | 2 | 全 P5 | Phase 5 |

**Sprint 6 SP合計: 58**
**Sprint 6 主要リスク:** Sprint 6 は E2E テスト・セキュリティテストが集中し SP=58 と高負荷。P5-41（fine-tuning）が eligible 組織ゼロで対象外になる場合は 13SP 削減（実質 45SP）。P5-47〜P5-50 のいずれかが品質基準未達の場合は Phase 6 に繰り越し、残りの機能をリリースする（部分リリース方針を採用）。

---

### Sprint 別ストーリーポイント合計

| Sprint | SP合計 | 主要リスク |
|--------|-------|----------|
| Sprint 1 | 29 SP | SMPLify-X 法務未完了・ECS移行未判断時は設計ADRのみ（15SP）に縮小 |
| Sprint 2 | 49 SP | SMPLify-X 推論精度未達・WebSocket実装複雑度。P5-12 を Sprint 3 分割で調整可 |
| Sprint 3 | 52 SP | リアルタイムコーチング UI（SP=13）の遅延目標達成困難時は緩和基準でMVPリリース |
| Sprint 4 | 50 SP | OAuth 2.0 セキュリティレビュー工数・fine-tuning eligible 組織数不確実性 |
| Sprint 5 | 45 SP | SOC2 監査機関スケジュール外部依存・GDPR/HIPAA 法的確認待ち |
| Sprint 6 | 58 SP（最大） / 45 SP（fine-tuning 対象外時） | E2E テスト品質基準未達時は部分リリース |
| **合計** | **283 SP（最大）** / **270 SP（fine-tuning 除外時）** | |

---

## 5. 新規 ADR 要件

Phase 5 では以下の ADR を新規作成すること（P5-01〜P5-05 の設計タスクに対応）：

| ADR# | タイトル | 担当 | 依存 |
|------|---------|------|------|
| ADR-022 | SMPLify-X 本番稼働設計（法務完了前提・2D→3D段階移行ロジック） | @05-architect | ADR-004 法務完了 |
| ADR-023 | リアルタイムコーチングアーキテクチャ（ECS常時稼働移行・WebSocket設計） | @05-architect | ADR-020 判断済み |
| ADR-024 | 国際展開技術設計（多言語・多通貨・GDPR・データレジデンシー） | @05-architect | なし |
| ADR-025 | パブリック API / SDK 設計（OAuth 2.0・エンドポイント定義・レートリミット・課金） | @05-architect | なし |
| ADR-026 | SOC2 / ISO 27001 監査対応ロードマップ（ギャップ分析 → 証拠収集 → 受審計画） | @05-architect | ADR-021 承認済み |
| ADR-027 | ウェアラブル拡張設計（Garmin・WHOOP・Oura API統合・統一データモデル） | @05-architect | なし |

---

## 6. 技術リスクと対策

| リスク | 影響度 | 発生確率 | 対策 |
|--------|--------|---------|------|
| SMPLify-X 法務レビュー Phase 5 開始前未完了 | 高（ARR 保護に影響） | 中 | MediaPipe 2D を継続し、法務完了後に Sprint N+1 で 3D 移行。3D 解析の KPI 計測開始を延期 |
| WebSocket CV の遅延 > 500ms（モバイル環境） | 中（UX 低下） | 高 | 閾値を 1,000ms に緩和してMVPリリース。Sprint 5〜6 でフレームスキップ最適化・エッジノード追加を検討 |
| SOC2 監査スケジュール遅延（監査機関都合） | 高（Enterprise 受注ブロッカー） | 中 | 監査機関を Phase 5 Sprint 1 開始前に選定・契約完了させる。審査申込みは Phase 4 末に実行 |
| fine-tuning eligible 組織が Sprint 6 時点でゼロ | 低（ARR 影響なし・スコープ縮小のみ） | 中 | P5-41〜P5-42 を Phase 6 に延期。Sprint 6 の SP を 13 削減し E2E テストに集中 |
| GDPR DSR 対応の法的解釈ミス | 高（EU 規制当局からの制裁） | 低 | EU 法務顧問レビューを P5-29 実装前に実施。30 日 SLA を法的要件として実装に反映 |
| ECS 常時稼働コスト増大（Spot→On-Demand） | 中（CV Engine コスト / ARR 比率が目標 3% 超過） | 中 | ADR-023 でコスト試算を実施し、分岐点（月間処理数 X 本以上で On-Demand が有利）を明示。移行後 2週間で CloudWatch コストメトリクスを確認し、目標超過時は Auto Scaling 設定を即時調整 |
| パブリック API への不正アクセス（OAuth トークン漏洩） | 高（防壁2・セキュリティインシデント） | 低 | トークン有効期限を 1 時間に設定・Refresh Token ローテーション・異常アクセス時の自動失効（Supabase Auth ブロック機能活用）・P5-44 でペネトレーションテスト実施 |

---

## 7. Phase 5 完了後の Phase 6 予告（検討事項）

以下は Phase 5 スコープ外であるが、Phase 6 計画策定の参考として記録する：

- **TeleHealth / LMS 連携**: ISO 27001 / SOC2 Type II 取得後に遠隔医療要件の法務審査着手
- **保険請求・診療報酬連携**: 医療費請求専門パートナーとの連携検討
- **ハードウェアデバイス（IMU センサー）**: ウェアラブル拡張の延長として独自 IoT センサー連携
- **AIエージェント自律トレーニング計画生成**: LangChain エージェントによる完全自律的な週次トレーニング計画策定

---

プロダクト計画が完成しました。
@05-architect を呼び出します。
以下のバックログと技術要件を渡し、CI/CDパイプラインとシステムアーキテクチャの設計・構築を開始させます。

## バックログサマリー（@05-architect への申し送り）

**Phase 5 Sprint 1〜6（12週間）合計: 最大 283 SP**

**Sprint 1 設計タスク（最優先）:**
- P5-01: ADR-022（SMPLify-X 本番稼働設計）
- P5-02: ADR-023（WebSocket リアルタイムコーチングアーキテクチャ）
- P5-03: ADR-024（国際展開技術設計）
- P5-04: ADR-025（パブリック API / SDK 設計）
- P5-05: ADR-026（SOC2 / ISO 27001 監査対応ロードマップ）

**主要技術判断事項（@05-architect が Sprint 1 中に決定すべき事項）:**
1. SMPLify-X 法務レビュー完了確認 → ADR-022 確定 → P5-06（Docker 更新）着手判断
2. ECS On-Demand 移行コスト試算 → ADR-023 確定 → P5-08（ECS 移行）着手判断
3. SOC2 監査機関の最終選定・契約確認（Phase 4 末に選定済みであることが前提）
4. パブリック API の OAuth 2.0 スコープ設計（ADR-025）とレートリミット値の確定

**技術スタック（Phase 4 末時点から追加・変更）:**
- 3D CV: SMPLify-X + SMPL モデル（法務完了後・Docker 追加）
- リアルタイム CV: FastAPI WebSocket + ECS On-Demand + Supabase Realtime
- 多言語: next-intl（Next.js App Router 対応）
- fine-tuning: Vertex AI Gemini fine-tuning API
- ウェアラブル: Garmin Connect IQ API / WHOOP API / Oura Ring API
- API 認証: OAuth 2.0 クライアント資格情報フロー（Supabase Edge Function）
- コンプライアンス: SOC2 Type I（監査機関選定済み前提）/ ISO 27001 ギャップ対応
