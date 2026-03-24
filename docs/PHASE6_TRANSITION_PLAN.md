# PACE Platform — Phase 6 移行計画書

> **文書バージョン:** 1.0
> **作成日:** 2026-03-24
> **作成者:** 01-pm（前頭葉 / プロダクトマネージャーエージェント）
> **ステータス:** 確定版（@05-architect へ引き渡し待ち）
> **対象フェーズ:** Phase 6（2026年Q2〜Q3、約16週間）

---

## 前提: フェーズ5完了確認

| 完了項目 | 確認状態 |
|---------|---------|
| Fitness-Fatigue Model (EWMA) + ACWR 実装 | 完了 |
| AIデイリーコーチ実装 | 完了 |
| デザインシステム v2.0（Emerald ブランド / WCAG AA） | 完了 |
| ADR-020〜026 記録 | 完了 |
| QA 121ケース全パス | 完了 |

---

## 1. ユーザーストーリーマップ

### アクター A: スタッフ（AT / PT / master / S&C）

| ゴール | エピック | ユーザーストーリー | 優先度 | フェーズ |
|--------|----------|-------------------|--------|---------|
| 選手を遠隔で診療する | TeleHealth ビデオ通話 | As a master, I want to initiate a video consultation from the player detail screen, so that I can provide medical guidance to athletes in remote locations. | Must | Phase 6 |
| 選手を遠隔で診療する | TeleHealth ビデオ通話 | As an AT/PT, I want to share assessment results and SOAP notes during a video call, so that I can conduct a complete remote consultation. | Must | Phase 6 |
| 医療費の請求業務を効率化する | 保険請求連携 | As a master, I want to generate SOAP-linked billing codes automatically, so that I can reduce manual billing errors. | Should | Phase 6 |
| 医療費の請求業務を効率化する | 保険請求連携 | As a master, I want to review and submit claims to the billing partner API, so that I can complete the reimbursement process within the platform. | Should | Phase 6 |
| AIに週次計画を自律生成させる | AIエージェント自律計画 | As an S&C coach, I want the AI to generate a full weekly training plan based on team ACWR and individual statuses, so that I only need to approve rather than build from scratch. | Must | Phase 6 |
| AIに週次計画を自律生成させる | AIエージェント自律計画 | As an AT, I want the AI to draft a 4-week rehabilitation roadmap based on diagnosis and RTP targets, so that I can focus on clinical judgment rather than planning logistics. | Must | Phase 6 |
| ウェアラブルセンサーデータを活用する | IMUセンサー連携 | As an S&C coach, I want to ingest IMU sensor data directly into PACE, so that I can track movement quality metrics without manual entry. | Should | Phase 6 |
| ウェアラブルセンサーデータを活用する | IMUセンサー連携 | As an AT, I want IMU-derived joint loading data to feed into the Bayesian assessment engine, so that my injury risk evaluations are more objective. | Should | Phase 6 |

### アクター B: 選手（Athlete Mobile App）

| ゴール | エピック | ユーザーストーリー | 優先度 | フェーズ |
|--------|----------|-------------------|--------|---------|
| スタッフとビデオ通話する | TeleHealth | As an athlete, I want to join a scheduled video call from the mobile app, so that I can consult with medical staff without travelling to the facility. | Must | Phase 6 |
| 週次計画を受け取る | AIエージェント計画受信 | As an athlete, I want to see my AI-generated weekly training and rehab schedule in the app, so that I can plan my week proactively. | Must | Phase 6 |
| センサーを装着して測定する | IMUセンサー連携 | As an athlete, I want to pair my IMU device via the mobile app, so that my movement data syncs automatically during training. | Could | Phase 6 |

---

## 2. MVPスコープ定義

### 選定基準

1. **収益直結性**: Pro プラン課金正当化に直接貢献するか
2. **ユーザー離脱防止**: これがなければ既存ユーザーが競合へ移行するリスクがあるか
3. **技術的依存関係**: 他機能の前提となる基盤作業か

---

### Phase 6 MVP必須機能（Sprint 1〜6 / 12週間）

#### TeleHealth / LMS連携（優先度: Must）

- **法務審査フレームワーク実装**
  理由: 遠隔診療法（医師法第20条）違反リスクを除去しないとビデオ通話は公開不可能。法務審査なしのリリースは事業継続リスク。なお、法務審査の結果によっては「診察」ではなく「相談・指導」として機能制限する可能性があり、実装前に法務結果を確定させること。

- **ビデオ通話基盤（WebRTC / Daily.co）**
  理由: TeleHealthの中核機能。スタッフが「遠隔医療をPACEで完結できる」というPro課金の差別化根拠。Daily.co を採用することでWebRTC実装工数を削減しつつHIPAA BAA（Business Associate Agreement）を取得済みのベンダーを使用する。

- **通話中コンテキスト共有（SOAP / アセスメント結果の画面共有）**
  理由: ビデオ通話単体では他ツールと差別化できない。PACE固有のデータが通話中に参照できることで価値が生まれる。

#### AIエージェント自律トレーニング計画生成（優先度: Must）

- **週次チームトレーニング計画の自律生成（S&C向け）**
  理由: 既存の「1回分メニュー生成」から「週単位の自律計画」へのアップグレード。S&C コーチの工数削減効果が大きく、Pro プランの継続率改善に直結する。

- **4週間リハビリロードマップ自律生成（AT/PT向け）**
  理由: RTP管理が「今日のメニュー」だけでなく「全体工程表」として見えることで、医療スタッフの臨床判断品質が向上する。LLM Context Injectionとベイズ推論の組み合わせにより他競合が模倣困難な差別化機能となる。

- **AIエージェント承認ループUI**
  理由: 自律生成した計画をスタッフが確認・承認するUIは医療安全上必須。自律生成だけではモック実装防壁に抵触する。

---

### Phase 2以降（Sprint 7〜8 / 4週間）

#### 保険請求・診療報酬連携（優先度: Should → Phase 6 後半）

- **除外理由（Phase 6 前半から）**: 医療費請求は専門パートナーとのAPI接続・法務契約・審査フローが必要。最低8週の法務・商務調整が前提となるため、技術実装はSprint 7以降に後ろ倒し。Sprint 1〜2でパートナー候補（メドケア / ソフトウェア事業者）との要件定義を並行実施する。

- **含める機能（Sprint 7〜8）**:
  - SOAP自動コーディング（ICD-10-CM / 診療報酬点数表 紐付け）
  - 請求データ生成 → パートナーAPI送信
  - 請求ステータス追跡UI（master ロール限定）

#### IMUセンサー連携（優先度: Should → Phase 6 後半）

- **除外理由（Phase 6 前半から）**: ハードウェアデバイスのBLEペアリング実装は、モバイルアプリへの大規模変更（expo-device / BLE SDK統合）が必要。TeleHealth・AIエージェントの安定稼働を優先しリソースを集中させる。

- **含める機能（Sprint 7〜8）**:
  - BLEデバイスペアリング（Expo React Native）
  - センサーデータ（加速度 / ジャイロ）の受信・パース
  - IMUデータ → ACWR計算への統合
  - Supabase `imu_sessions` テーブル設計・実装

---

### スコープ外（Phase 6では実施しない）

| 機能名 | 除外理由 |
|--------|---------|
| LMS（学習管理システム）統合 | 教育コンテンツ配信はPACEのコア価値（傷害管理・パフォーマンス）と乖離する。別事業として評価が必要 |
| 電子カルテ（EMR）システム連携 | HL7 FHIR実装は3〜6ヶ月規模。Phase 7以降に独立プロジェクトとして計画する |
| AIによる診断の自動確定 | 医師法上「最終臨床判断はフィールドスタッフが行う」原則を侵害するリスクがある。AIはあくまで補助に留める |
| 独自IMUセンサーのファームウェア開発 | ハードウェア開発はソフトウェア開発と異なるバリューチェーンが必要。既製センサー（例: Catapult / Polar）との連携を先行する |

---

## 3. KPIツリーと成功指標

```
最上位目標: Phase 6 完了時点で月間ARR 1,200万円（現状比 +40%）
│
├── 獲得KPI
│   ├── TeleHealth 起因の新規Pro契約数: 月+3件
│   │   計測方法: CRMのリード獲得理由タグ "TeleHealth" でフィルター
│   ├── AIエージェント起因の新規Pro契約数: 月+5件
│   │   計測方法: デモ申込フォームの「最も興味のある機能」選択肢
│   └── Phase 6 機能による既存顧客のアップセル: 月+2件
│       計測方法: Supabase billing テーブルの plan変更ログ
│
├── 活性化KPI（Pro契約チームの利用率）
│   ├── TeleHealth 通話セッション数: 週10件以上（Phase 6リリース後4週以内）
│   │   計測方法: video_sessions テーブルの created_at ログ
│   ├── AIエージェント計画自律生成の利用率: 対象スタッフの60%以上が週1回以上使用
│   │   計測方法: ai_plan_jobs テーブルの generated_by_agent = true フラグ
│   ├── IMUセンサーペアリング率: 対応デバイス所持チームの50%以上
│   │   計測方法: imu_devices テーブルのペアリング完了数
│   └── 請求申請処理時間（請求連携後）: 従来比 -60%
│       計測方法: billing_claims テーブルの created_at〜submitted_at 差分
│
├── 継続KPI
│   ├── Pro プラン月次解約率（Churn Rate）: 3%以下を維持（上限）
│   │   計測方法: Supabase billing テーブルのキャンセルイベント
│   └── TeleHealth 通話品質満足度（CSAT）: 4.0/5.0以上
│       計測方法: 通話終了後のin-app評価（1〜5スター）
│
└── リスクKPI（防壁指標）
    ├── TeleHealth 法務コンプライアンス違反件数: 0件
    │   計測方法: 監査ログ + 法務レビュー月次確認
    ├── IMUセンサーデータのベイズ推論精度劣化: 既存推論精度 -5%以内
    │   計測方法: テストセットでの診断精度比較（CI/CDパイプライン自動計測）
    └── AIエージェント生成計画の承認率: 70%以上
        計測方法: ai_plan_jobs の approved / rejected 比率
```

---

## 4. スプリント構成（16週間）

### スプリント概要

| Sprint | 期間 | テーマ | 担当主体 |
|--------|------|--------|---------|
| Sprint 1 | Week 1〜2 | 法務審査 + アーキテクチャ設計 + DB設計 | @05-architect + 法務チーム |
| Sprint 2 | Week 3〜4 | TeleHealth基盤（WebRTC/Daily.co）バックエンド実装 | @04-backend |
| Sprint 3 | Week 5〜6 | TeleHealth フロントエンド（Web + Mobile） | @03-frontend + @06-mobile |
| Sprint 4 | Week 7〜8 | AIエージェント自律計画生成エンジン（バックエンド） | @04-backend + @07-ai |
| Sprint 5 | Week 9〜10 | AIエージェント承認ループUI + 週次計画表示 | @03-frontend |
| Sprint 6 | Week 11〜12 | Sprint 1〜5 統合テスト + QA + ADR記録 | @08-qa + 全エージェント |
| Sprint 7 | Week 13〜14 | 保険請求連携 + IMUセンサーBLE実装 | @04-backend + @06-mobile |
| Sprint 8 | Week 15〜16 | Sprint 7統合テスト + E2Eテスト + リリース準備 | @08-qa + @05-architect |

---

## 5. 優先順位付き開発バックログ

### Phase 6 MVP バックログ（Sprint 1〜6）

| # | タスク名 | 担当エージェント | SP | 依存 | Sprint |
|---|----------|-----------------|----|----- |--------|
| P6-001 | 遠隔診療法務審査: 医師法第20条 / 薬機法 適合範囲確認 | @05-architect + 法務 | 8 | なし | S1 |
| P6-002 | TeleHealth用DBスキーマ設計（video_sessions / consultation_records） | @05-architect | 5 | P6-001 | S1 |
| P6-003 | AIエージェント自律計画用DBスキーマ設計（ai_plan_jobs / weekly_plans） | @05-architect | 5 | なし | S1 |
| P6-004 | ADR-027: TeleHealthベンダー選定（Daily.co vs Agora vs Twilio）記録 | @05-architect | 3 | P6-001 | S1 |
| P6-005 | Daily.co API統合: ルーム生成 / トークン発行 / Webhook受信 | @04-backend | 8 | P6-002 | S2 |
| P6-006 | TeleHealth通話セッション管理API（開始・終了・記録保存） | @04-backend | 5 | P6-005 | S2 |
| P6-007 | 通話中コンテキスト共有API（SOAP / アセスメント結果の取得エンドポイント） | @04-backend | 5 | P6-006 | S2 |
| P6-008 | レートリミット: TeleHealth API エンドポイントへのユーザー別制限適用 | @04-backend | 3 | P6-006 | S2 |
| P6-009 | TeleHealth Web UI: 通話開始 / 終了 / コンテキストパネル（Next.js） | @03-frontend | 8 | P6-007 | S3 |
| P6-010 | TeleHealth Mobile UI: 通話参加 / 通知（Expo React Native） | @06-mobile | 8 | P6-007 | S3 |
| P6-011 | 通話中 SOAP表示・編集パネル（スタッフWebのオーバーレイUI） | @03-frontend | 5 | P6-009 | S3 |
| P6-012 | TeleHealth 監査ログ（通話開始・終了・参加者・接続品質をaudit_logsへ記録） | @04-backend | 3 | P6-006 | S3 |
| P6-013 | AIエージェント: 週次チームトレーニング計画自律生成ロジック実装 | @04-backend + @07-ai | 13 | P6-003 | S4 |
| P6-014 | AIエージェント: 4週間リハビリロードマップ自律生成ロジック実装 | @04-backend + @07-ai | 13 | P6-003 | S4 |
| P6-015 | AIエージェント: LLM Context Injection（ベイズ推論結果 + ACWR + Hard Lock）のプロンプト統合 | @07-ai | 8 | P6-013, P6-014 | S4 |
| P6-016 | AIエージェント: プロンプトインジェクション対策 + 出力ガードレール実装 | @07-ai | 5 | P6-015 | S4 |
| P6-017 | AIエージェント: JSONパース失敗時の自動リトライ（最大3回・指数バックオフ）実装 | @04-backend | 3 | P6-013 | S4 |
| P6-018 | AIエージェント: トークン使用量追跡 + コスト保護（月次上限アラート） | @04-backend | 3 | P6-015 | S4 |
| P6-019 | AIエージェント承認ループ Web UI（計画レビュー / 修正 / 承認 / 差し戻し） | @03-frontend | 8 | P6-013, P6-014 | S5 |
| P6-020 | 週次計画カレンダー表示（チーム向け / 個人向けフィルター付き） | @03-frontend | 5 | P6-019 | S5 |
| P6-021 | AIエージェント生成計画の Mobile 通知（Expo Notifications） | @06-mobile | 3 | P6-019 | S5 |
| P6-022 | ADR-028: AIエージェント自律計画生成のリスク管理方針記録 | @05-architect | 2 | P6-019 | S5 |
| P6-023 | Sprint 1〜5 統合テスト: TeleHealth E2Eシナリオ（20ケース） | @08-qa | 8 | P6-011 | S6 |
| P6-024 | Sprint 1〜5 統合テスト: AIエージェント計画生成E2Eシナリオ（20ケース） | @08-qa | 8 | P6-021 | S6 |
| P6-025 | セキュリティ監査: TeleHealth通信暗号化 + HIPAA準拠確認 | @08-qa + 法務 | 8 | P6-023 | S6 |
| P6-026 | ADR-029〜031: Phase 6 前半アーキテクチャ決定事項の記録 | @05-architect | 3 | P6-025 | S6 |

### Phase 6 後半バックログ（Sprint 7〜8）

| # | タスク名 | 担当エージェント | SP | 依存 | Sprint |
|---|----------|-----------------|----|----- |--------|
| P6-027 | 保険請求パートナーAPI契約・要件定義完了（外部タスク） | PM | 0 | P6-001 | S7 |
| P6-028 | DBスキーマ: billing_claims / billing_codes テーブル設計 | @05-architect | 5 | P6-027 | S7 |
| P6-029 | SOAP自動コーディングAPI（ICD-10-CM / 診療報酬点数表マッピング） | @04-backend | 8 | P6-028 | S7 |
| P6-030 | 請求データ生成 → パートナーAPI送信エンドポイント | @04-backend | 8 | P6-029 | S7 |
| P6-031 | 請求ステータス追跡 Web UI（master ロール限定） | @03-frontend | 5 | P6-030 | S7 |
| P6-032 | DBスキーマ: imu_devices / imu_sessions テーブル設計 | @05-architect | 5 | なし | S7 |
| P6-033 | IMU BLEペアリング実装（Expo React Native + react-native-ble-plx） | @06-mobile | 8 | P6-032 | S7 |
| P6-034 | IMUセンサーデータ受信・パース（加速度 / ジャイロ → ACWR統合） | @04-backend | 8 | P6-033 | S7 |
| P6-035 | Sprint 7 統合テスト（保険請求 / IMU E2E各15ケース） | @08-qa | 8 | P6-034 | S8 |
| P6-036 | ADR-032〜034: Phase 6 後半アーキテクチャ決定事項の記録 | @05-architect | 3 | P6-035 | S8 |
| P6-037 | Phase 6 全体リリースノート + ドキュメント更新 | @05-architect | 3 | P6-036 | S8 |
| P6-038 | 本番環境デプロイ + 監視設定更新（新サービス追加分） | @04-backend | 5 | P6-037 | S8 |

---

## 6. リスク管理

### リスクマトリクス

| # | リスク項目 | 発生確率 | 影響度 | 対応策 | オーナー |
|---|-----------|---------|--------|--------|---------|
| R-01 | **遠隔診療法務審査で「診察不可」判定** | 高 | 致命的 | Sprint 1でGo/No-Go判定。No-Goの場合はビデオ通話を「相談・コーチング」に機能制限してリリース。診察機能は別途薬機法・医師法対応後に追加する。 | PM + 法務 |
| R-02 | **Daily.co HIPAA BAA取得遅延** | 中 | 高 | Twilioを代替ベンダーとして事前評価済み状態でSprint 2開始。BAAが2週間以内に取得できない場合はTwilioへ切替。 | @05-architect |
| R-03 | **AIエージェント計画品質が承認率70%を下回る** | 中 | 中 | LLM Context Injectionのプロンプト改善サイクルをSprint 4〜5に2週間確保。承認率50%以下の場合はSprint 6で追加チューニングスプリントを設ける。 | @07-ai |
| R-04 | **IMUセンサーメーカーAPIの仕様非公開 / 接続不可** | 中 | 中 | Sprint 1でCatapult / Polar / Garmin の3社に技術確認。1社でも対応可能であれば進行。全社NG場合はPhase 7への延期。 | PM |
| R-05 | **保険請求パートナーとの契約が16週以内に完了しない** | 高 | 低〜中 | Phase 6後半（Sprint 7〜8）のタスクのため、Sprint 7開始前にGo/No-Go判断。未完了の場合は当該タスクをPhase 7へ繰越してもPhase 6全体のスケジュールに影響しない。 | PM |
| R-06 | **TeleHealth通話中の個人情報漏洩** | 低 | 致命的 | Daily.co側のE2E暗号化 + Supabase監査ログの二重防御。Sprint 6でペネトレーションテスト実施。 | @08-qa |
| R-07 | **AIエージェント自律生成が医療行為と解釈される法的リスク** | 低〜中 | 高 | 全AI出力に「最終臨床判断はスタッフが行う」免責表示を必須化（ADR-028で記録）。承認ループUIを省略する実装を禁止する。 | @05-architect + 法務 |
| R-08 | **Gemini APIコスト急増（週次計画生成による大量トークン消費）** | 中 | 中 | P6-018でトークン追跡 + 月次上限アラートを実装。上限超過時はキュー待機（即時生成を停止）する設計とする。 | @04-backend |

### Go/No-Go判断基準（Sprint 1終了時点）

以下の全項目が「Go」でなければSprint 2のTeleHealth実装を停止し、AIエージェント機能のみに集中する。

- [ ] 遠隔診療の提供範囲（相談 or 診察）が法務審査で確定している
- [ ] TeleHealthベンダーのHIPAA BAA締結（またはBAA不要の機能制限方針確定）
- [ ] Daily.co / Twilio いずれかのSandbox環境での疎通確認完了

---

## 7. 技術要件サマリー（@05-architect へ引き渡し）

### 新規追加技術コンポーネント

| コンポーネント | 採用技術 | 理由 |
|--------------|---------|------|
| TeleHealth ビデオ通話 | Daily.co REST API + daily-js SDK | HIPAA BAA対応・WebRTC SFU不要・Next.js統合容易 |
| TeleHealth Mobile | @daily-co/daily-react-native | Expo互換・公式サポート |
| IMU BLE通信 | react-native-ble-plx | Expo managed workflowでの実績あり |
| AIエージェント計画生成 | Gemini API（google-generativeai） + LangChain Agent | 既存スタックとの整合性 |
| 保険請求API | パートナー選定後に確定（TBD） | Sprint 1で調査 |

### 新規DBテーブル（概要）

```
video_sessions        -- TeleHealth通話セッション管理
consultation_records  -- 通話と紐付いたSOAP・アセスメント参照ログ
ai_plan_jobs          -- AIエージェント計画生成ジョブ管理
weekly_plans          -- AI生成の週次計画（チーム・個人）
imu_devices           -- IMUデバイスペアリング情報
imu_sessions          -- IMUセンサーセッションデータ
billing_claims        -- 保険請求データ
billing_codes         -- ICD-10-CM / 診療報酬コードマスター
```

### 商用AI防壁の適用確認（Phase 6 全機能）

| 防壁 | TeleHealth | AIエージェント | IMU連携 | 保険請求 |
|-----|-----------|--------------|---------|---------|
| 【防壁1】モック実装の完全排除 | Daily.co 本番API必須 | Gemini API 本番必須 | 実機デバイス必須 | パートナーAPI本番必須 |
| 【防壁2】AIセキュリティ | — | プロンプトインジェクション対策 + 出力ガードレール（P6-016） | — | — |
| 【防壁3】コスト保護 | Daily.co 通話分数トラッキング（P6-008） | トークン使用量追跡 + 月次上限（P6-018） | — | — |
| 【防壁4】耐障害性 | 通話切断時の自動再接続 + セッション記録保全 | JSONパース失敗時3回リトライ（P6-017） | BLE切断時の自動再接続 | 請求送信失敗時のリトライキュー |

---

## 8. ADR 予告（記録予定）

| ADR番号 | テーマ | Sprint |
|---------|--------|--------|
| ADR-027 | TeleHealthベンダー選定（Daily.co vs Agora vs Twilio） | S1 |
| ADR-028 | AIエージェント自律計画生成のリスク管理・免責方針 | S5 |
| ADR-029 | TeleHealth通信暗号化方式 | S6 |
| ADR-030 | IMUセンサーベンダー選定 | S6 |
| ADR-031 | 保険請求パートナーAPI統合方式 | S6 |
| ADR-032 | IMU-ベイズ推論統合の精度検証プロトコル | S8 |
| ADR-033 | AIエージェント計画承認ループのUI/UX基準 | S8 |
| ADR-034 | Phase 6 全体セキュリティ監査結果 | S8 |

---

## 9. 成果物と受入基準

### Phase 6 完了定義（Definition of Done）

- [ ] 全バックログタスク（P6-001〜P6-038）の実装完了
- [ ] QA: E2Eテスト 55ケース以上（TeleHealth 20 + AIエージェント 20 + 後半機能 15）全パス
- [ ] WCAG AA準拠: 新規UIコンポーネント全点検完了
- [ ] ADR-027〜034 全て記録・レビュー済み
- [ ] 本番環境デプロイ + 監視ダッシュボード更新完了
- [ ] TeleHealth 法務コンプライアンス確認済み（法務サインオフ）
- [ ] Gemini API コスト: Phase 6 新機能による月次追加コストが想定予算内（事前合意額）
- [ ] CSAT（TeleHealth通話品質）: ベータテスト期間中 4.0/5.0 以上

---

## 自律連鎖トリガー

プロダクト計画が完成しました。
@05-architect を呼び出します。
以下のバックログと技術要件を渡し、CI/CDパイプラインとシステムアーキテクチャの設計・構築を開始させます。

**バックログサマリー（Phase 6 MVP）:**
- 総タスク数: 38件（P6-001〜P6-038）
- 総ストーリーポイント: 約208 SP
- Sprint 1〜6（12週）: TeleHealth基盤 + AIエージェント自律計画生成
- Sprint 7〜8（4週）: 保険請求連携 + IMUセンサーBLE実装

**最優先アーキテクチャ設計タスク（Sprint 1）:**
1. `ADR-027` TeleHealth ベンダー選定（Daily.co / Agora / Twilio HIPAA BAA対応比較）
2. `video_sessions`, `ai_plan_jobs`, `weekly_plans` テーブルの詳細スキーマ設計
3. Daily.co WebRTC統合 → Next.js App Router + Expo React Native の双方向対応方針決定
4. AIエージェントLangChain実装方針（Gemini 2.0 Flash + LangChain AgentExecutor）
5. Sprint 1 Go/No-Go チェックリストの完了確認

**技術スタック（確定 / 新規追加）:**
- TeleHealth: Daily.co REST API + daily-js + @daily-co/daily-react-native
- AIエージェント: Gemini 2.0 Flash + LangChain AgentExecutor + Supabase pgvector
- IMU: react-native-ble-plx（Expo managed workflow）
- 既存スタック: Next.js 15 / Expo React Native / Supabase / PostgreSQL RLS / AWS S3
