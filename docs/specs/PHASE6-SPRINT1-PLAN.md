# Phase 6 Sprint 1 詳細計画書

> **文書バージョン:** 4.0
> **作成日:** 2026-04-01
> **最終更新:** 2026-04-01
> **作成者:** 01-pm（前頭葉 / プロダクトマネージャーエージェント）
> **ステータス:** ドラフト（オーナー確認待ち）
> **対象期間:** Week 1〜2（2026年4月第2週〜第3週）
> **親文書:** docs/PHASE6_TRANSITION_PLAN.md
> **準拠指示書:**
> - docs/specs/implementation-change-directive.md v3.2（2026-03-25 確定）
> - PACE v6.1 究極のマスタープラン Phase 1-5

---

## 0. マスタープラン準拠の確認

### 0-1. PACE v6.1 絶対原則（Phase 1 準拠）

Sprint 1 の全タスクは以下の絶対原則に違反してはならない:

| # | 原則 | Sprint 1 での遵守方法 |
|---|------|----------------------|
| **A1** | **エビデンス基準: Oxford CEBM Level 2 以上** | PB-001（Engine設計）で採用するモデルは全て Level 2+ 文献で裏付け |
| **A2** | **100%確定的判定: LLM出力を判定に不使用** | Gemini は Node 5 NLG / SOAP / InsightCard のみ。Node 0-4 にLLMは介在しない |
| **A3** | **専門家委譲: データ品質不良時は判定しない** | qualityScore < 0.6 → YELLOW + 専門家確認推奨。RED/ORANGE は上書きしない |

### 0-2. Phase 5 完了確認

| 完了項目 | 確認状態 |
|---------|---------|
| Fitness-Fatigue Model (EWMA) + ACWR 実装 | 完了 |
| AIデイリーコーチ実装 | 完了 |
| デザインシステム v2.0（Emerald ブランド / WCAG AA） | 完了 |
| ADR-020〜026 記録 | 完了 |
| QA 121ケース全パス | 完了 |

### 0-3. 監査レポート対応状況（Phase 5 準拠）

| # | 深刻度 | 脆弱性 | 対応状況 |
|---|--------|--------|---------|
| 1 | CRITICAL | RLSポリシー不整合 | **修正完了** — 51全テーブルで org_id + user_id 分離が機能 |
| 2 | HIGH | `as unknown as` 型キャスト10箇所 | **解消済み** — 型ガードへ置換完了 |
| 3 | HIGH | Middleware クラッシュ時の全リクエスト許可 | **解消済み** — クラッシュ時 503 返却 |
| 4 | HIGH | /api/checkin の所有権チェック欠如 | **解消済み** — 本人送信のみ許可 |

### 0-4. Go推論エンジン Shadow Mode ステータス（Phase 4 準拠）

| 項目 | 期待値 | 現在ステータス | 確認方法 |
|------|--------|-------------|---------|
| Shadow Mode 不一致率 | < 0.1% | **要確認** | inference_trace_logs の `engine` カラム |
| 50件テストフィクスチャ通過 | TS/Go 完全一致 | **要確認** | CI パイプライン |
| Go レイテンシ（P95） | < 50ms | **要確認** | Sentry / APM |
| Go エラー率 | < 0.01% | **要確認** | Go サービスのエラーログ |
| キルスイッチ動作確認 | GO_ENGINE_ENABLED=false で 5分以内にTS切替 | **要確認** | 手動テスト |

### 0-5. 変更指示書 v3.2 による機能断捨離

| 廃止機能 | 対応 |
|---------|------|
| **TeleHealth** | Phase A でクリーンアップ |
| **Insurance Billing** | Phase A でクリーンアップ |
| **Enterprise Management** | 凍結（非表示） |

---

## 1. ビジネスモデルと収益構造

### 1-1. プラン構成（plan-gates.ts 準拠）

| プラン | 月額 | スタッフ | 選手 | 機能範囲 |
|--------|------|---------|------|---------|
| **Standard** | ¥100,000 | 5 | 50 | 基本アセスメント・日次チェックイン |
| **Pro** | ¥300,000 | 20 | 200 | Standard + Gemini AI分析・高度ダッシュボード |
| **Pro + CV** | ¥500,000 | 20 | 200 | Pro + CV解析 50本/月 |
| **Enterprise** | ¥600,000 | 無制限 | 無制限 | 全機能 + 複数チーム管理 |

### 1-2. 収益ターゲット

| 指標 | 現在値 | 2026年末目標 |
|------|-------|------------|
| MRR | ¥6M（20チーム × Pro） | ¥10M |
| ARPU | ¥300K | ¥400K（CV Addon 30%採用） |
| チャーン | ~4%/月 | ≤3%/月 |
| トライアル→有料転換 | 未計測 | 70% |

### 1-3. マスタープランに基づく収益ドライバー

> **Phase 2 の核心:** 「高度分析 + 専門家委譲 = 信頼 = 解約防止」
> **Phase 5 の核心:** 「inference_trace_logs = 100%確定的ファクト = ROI証明 = 更新理由」

| Phase | 収益ドライバー | マスタープラン根拠 |
|-------|--------------|------------------|
| **B (Engine)** | **コンディション・スコア = DAU定着の要** — 確定的パイプライン（P1-P5）による毎朝の判定が選手の日常利用を固定化 | Phase 3: 確定的数理モデル |
| **C (Athlete UI)** | **UI Firewall（選手側）= 摩擦ゼロのエンゲージメント** — MetricLabel二層表現で「分かりやすさ」を提供、Bio-Swipeランダム化で「慣れによる嘘」を防止 | Phase 2: UXファイヤーウォール |
| **D (Dashboard)** | **UI Firewall（スタッフ側）= 高解像度分析 + ファクトベースROI** — inference_trace_logsから「今月X件のP2危険域を検知」を抽出し、契約更新の定量根拠に | Phase 5: Audit-Driven ROI |
| **E (Calendar)** | **Pro差別化 = アップセル** — スケジュールを負荷予測コンテキストとして利用 | Phase 2: SaaSアップセルの源泉 |

### 1-4. Phase 6 新機能のプラン別ゲーティング

> **判断原則:** 確定的判定（P1-P5）による基本スコアは全プラン提供（DAU定着最優先）。LLM依存機能・高度分析はPro以上に限定（A2原則 + コスト回収）。

| 新機能 | Std | Pro | Pro+CV | Ent | ゲーティング根拠 |
|--------|-----|-----|--------|-----|----------------|
| **コンディション・スコア表示**（P1-P5確定的判定） | ○ | ○ | ○ | ○ | コアバリュー。全ユーザーに提供しDAU定着 |
| **InsightCard**（Gemini NLG） | × | ○ | ○ | ○ | LLM APIコスト + A2原則で判定とは分離 |
| **4大KPIダッシュボード** | 2項目 | 全4 | 全4 | 全4 | Std=Critical+Availability、Pro以上=全KPI |
| **ファクトベースROIレポート** | × | ○ | ○ | ○ | inference_trace_logsの高度集計。Pro差別化 |
| **Google Calendar連携** | × | ○ | ○ | ○ | Function Calling + OAuth管理コスト |
| **AI週次計画（自律生成）** | × | ○ | ○ | ○ | LLMトークンコスト + 高価値機能 |
| **ACWRトレンドチャート** | × | ○ | ○ | ○ | 高度分析。Pro差別化 |
| **リハビリロードマップ** | 基本 | 対話型 | 対話型 | 対話型 | 基本はStd、詳細操作はPro |

**plan-gates.ts 追加予定フラグ:**

```typescript
| 'feature_condition_score'       // P1-P5確定的スコア（全プラン）
| 'feature_insight_card'          // Gemini InsightCard（Pro以上）
| 'feature_calendar_sync'         // Google Calendar Function Calling（Pro以上）
| 'feature_ai_weekly_plan'        // AI週次計画 + トークン上限管理（Pro以上）
| 'feature_risk_avoidance_report' // ファクトベースROIレポート（Pro以上）
```

---

## 2. Sprint 1 タスク詳細分解

### 優先順位（マスタープラン整合）

| 優先度 | Phase | マスタープラン根拠 | 収益効果 | SP |
|--------|-------|------------------|---------|-----|
| **P0** | **B (Engine)** | Phase 3: 確定的数理モデル — P1-P5判定が全ての信頼の源泉 | DAU定着 → チャーン抑制 | 10 |
| **P1** | **D (Dashboard)** | Phase 5: Audit-Driven ROI — inference_trace_logsがファクトベース更新理由 | ROI証明 → 更新率向上 | 5 |
| **P1** | **C (Athlete UI)** | Phase 2: UI Firewall — 選手に摩擦ゼロ体験、MetricLabel二層表現 | チェックイン率 → データ量 | 5 |
| **P2** | **E (Calendar)** | Phase 2: SaaSアップセル源泉 — Function Calling戦略 | Pro差別化 → アップセル | 3 |
| **P2** | **AI Agent** | Phase 2: SaaSアップセル源泉 — LLMトークン上限によるコスト制御 | Pro差別化 | 5 |
| **P3** | **A (Cleanup)** | Phase 1: 不要コード削除で開発速度向上 | 技術負債解消 | 3 |
| **P3** | **Security** | Phase 5: サプライチェーン防衛 — SBOM / Dependabot | エンタープライズ信頼 | 2 |

### [P0] PB-001: 確定的コンディション・スコア設計（SP: 10）

> **マスタープラン Phase 3 準拠:** P1-P5 優先階層判定を基盤とした、100%確定的なスコア算出。LLMは一切関与しない。

| サブID | タスク名 | 担当 | SP | Day |
|--------|---------|------|-----|-----|
| PB-001-1 | **ハイブリッド・ピーキング計算仕様書** — Fitness (42日EWMA) / Fatigue (7日EWMA + 朝の主観ペナルティ: 睡眠・疲労感不良時) / Readiness = (Fitness - Fatigue) を0-100正規化。**Pro Mode: HRV がベースライン下回り時に Fatigue にペナルティ係数を乗算** | @04-backend + @05-architect | 3 | D1-D3 |
| PB-001-2 | **P1-P5 判定との統合仕様** — Readiness スコアと既存 P1-P5 優先階層の関係を明確化。Readiness はUI表示用スコア、P1-P5 は確定的判定（RED/ORANGE/YELLOW/GREEN）。**両者は独立し混合しない** | @04-backend | 2 | D3-D5 |
| PB-001-3 | **LLM責務分離の設計文書** — Gemini の責務を Node 5 NLG + SOAP + InsightCard + デイリーコーチに厳格限定。**LLMダウン時のテンプレートフォールバック仕様**を明記。Function Calling (JSON Schema Mode) の GPS/Calendar API 適用方針 | @04-backend + @05-architect | 2 | D3-D5 |
| PB-001-4 | **daily_metrics テーブル拡張設計** — Fitness/Fatigue/Readiness カラム追加 + plan-gates 拡張（`feature_condition_score` 全プラン / `feature_insight_card` Pro以上） | @06-data-engineer + @04-backend | 2 | D4-D7 |
| PB-001-5 | **段階的Z-Score + 傾向通知の確認** — 14日の崖解消（0-13日:0%, 14-21日:50%, 22-27日:75%, 28日+:100%）。傾向通知は判定色を変えず `trend_notices` に追加のみ | @04-backend | 1 | D5-D6 |

**完了基準:**
- 全計算式は確定的（LLM不使用）であることが文書で明示
- P1-P5 と Readiness スコアの独立性が設計書に記載
- LLM責務分離文書が ADR として記録
- Gemini ダウン時のフォールバック動作が定義済み

### [P1] PD-001: Staff Dashboard — ファクトベースROI可視化（SP: 5）

> **マスタープラン Phase 5 準拠:** inference_trace_logs（Node 0-5 の確定的推論軌跡）から、推測ではなく「100%確定的アルゴリズムが記録したファクト」としてROIを証明する。

| サブID | タスク名 | 担当 | SP | Day |
|--------|---------|------|-----|-----|
| PD-001-1 | **4大KPIカード仕様** — Critical(--red) / Availability / Team Peaking / Watchlist(--amber)。プラン別: Standard=2項目、Pro以上=全4項目 | @02-ui-ux + @03-frontend | 2 | D1-D4 |
| PD-001-2 | **ファクトベースROIレポート仕様** — inference_trace_logs から「今月 X件の P2(ACWR>1.5) 危険域を検知 → 負荷調整をアシストした件数」を正確抽出。**推測ではなくファクト**として提示。`.alert-card.alert-blue` | @02-ui-ux + @04-backend | 1 | D3-D5 |
| PD-001-3 | **CalendarSyncChart + AcwrTrendChart** — ACWRトレンドに過負荷閾値 1.5 の --amber 点線。Google Calendar 連携グラフ（試合/高負荷をX軸マッピング） | @03-frontend + @05-architect | 1 | D5-D7 |
| PD-001-4 | **アップグレードCTA仕様** — Standard→Pro導線: KPIカード制限時のぼかし + 「Proで全データを表示」 | @02-ui-ux | 1 | D5-D7 |

**完了基準:**
- ROIレポートのデータソースが inference_trace_logs に紐付け済み
- 「P2検知件数」「推定回避離脱日数」の計算式が確定
- Standard / Pro のダッシュボード表示差分が明確化

### [P1] PC-001: Athlete UI — UI Firewall（摩擦ゼロ側）（SP: 5）

> **マスタープラン Phase 2 準拠:** 選手には「摩擦ゼロの体験」を提供。MetricLabel二層表現でデータ解像度を選手向けに最適化。Bio-Swipeのランダム化で「慣れによる嘘（自動操縦）」を防止。

| サブID | タスク名 | 担当 | SP | Day |
|--------|---------|------|-----|-----|
| PC-001-1 | **ConditionCircleRing + KpiBreakdownRow** — Readiness スコアをリング表示（--teal〜--red）。3大サブ指標: フィットネス蓄積/疲労負荷/ACWR。**MetricLabel二層表現: 選手は「好調 🟢 82」、スタッフはReadiness 82.0 + ACWR 1.12** | @02-ui-ux + @03-frontend | 2 | D4-D7 |
| PC-001-2 | **InsightCard（Pro限定）** — Gemini NLG による専門用語なし日本語アドバイス。**Standard には「Proでパーソナライズアドバイスを受け取る」CTA表示。LLMダウン時はテンプレートテキストへフォールバック** | @02-ui-ux | 1 | D3-D5 |
| PC-001-3 | **AdaptiveCheckinForm** — Bio-Swipe→スライダーフォーム。**質問順序ランダム化（自動操縦防止）**。Fatigue Focus（高負荷後: 3問に絞込） / Vigor モード。**完了後のスコア即時表示（<1秒）で継続動機付け** | @02-ui-ux | 1 | D1-D3 |
| PC-001-4 | **トライアル→有料転換タッチポイント** — Day 7連続チェックイン達成→Pro機能プレビュー。Day 14→Standard降格時のUpgradeCTA | @02-ui-ux | 1 | D5-D7 |

**完了基準:**
- MetricLabel の選手向け/スタッフ向け変換ルール表が確定
- チェックインの質問順序ランダム化ロジックが定義済み
- InsightCard の LLM フォールバック動作が定義済み

### [P2] PE-001: Google Calendar — Function Calling 戦略（SP: 3）

> **マスタープラン Phase 2 準拠:** ファンクションコーリングで不確実性を排除。試合日の自動取得で contextFlags.isGameDay を設定。

| サブID | タスク名 | 担当 | SP | Day |
|--------|---------|------|-----|-----|
| PE-001-1 | **Calendar API Function Calling 仕様** — 試合(Match)/高負荷練習イベント抽出。contextFlags.isGameDay / isHighLoadDay 自動設定。JSON Schema Mode での構造化出力 | @04-backend + @05-architect | 2 | D1-D4 |
| PE-001-2 | **ADR-027: Calendar 負荷予測統合**（Pro以上限定の根拠 + Function Calling 設計判断） | @05-architect | 1 | D4-D5 |

### [P2] P6-003: AIエージェント DB設計（SP: 5）

> **マスタープラン Phase 2 準拠:** LLM出力はトレーニング計画生成のみ。判定ロジックへの干渉はA2原則で禁止。トークンコスト上限によるプラン別制御。

| サブID | タスク名 | 担当 | SP | Day |
|--------|---------|------|-----|-----|
| P6-003-1 | **ai_plan_jobs テーブル** — ジョブ管理 / ステータス遷移 / `token_budget` カラム（Pro: 30K tokens/月, Enterprise: 100K tokens/月）/ **LLM出力は計画生成のみ、判定には不使用の制約をスキーマコメントで明記** | @05-architect | 2 | D1-D3 |
| P6-003-2 | **weekly_plans テーブル** — チーム計画/個人計画/承認ステータス。**スタッフ承認必須（human-in-the-loop）の制約** | @05-architect | 2 | D3-D5 |
| P6-003-3 | **マイグレーションファイル作成**（手動実行用SQL出力） | @05-architect | 1 | D5-D6 |

### [P3] PA-001: Cleanup + サプライチェーン防衛（SP: 5）

> **マスタープラン Phase 1 (Cleanup) + Phase 5 (Supply Chain Security) 準拠**

| サブID | タスク名 | 担当 | SP | Day |
|--------|---------|------|-----|-----|
| PA-001-1 | **廃止API一括削除** — /api/telehealth + /api/billing 関連ルート | @04-backend | 1 | D1-D2 |
| PA-001-2 | **廃止テーブル DROP SQL** — telehealth_sessions, billing_codes, billing_claims（手動実行用） | @06-data-engineer | 1 | D3 |
| PA-001-3 | **サプライチェーン防衛基盤** — `.npmrc` に `save-exact=true` 追加 / `.github/dependabot.yml` 追加 / `npm audit` をCI必須ステップ化 / **SBOM生成** (`@cyclonedx/cyclonedx-npm`) をCIに追加 | @05-architect | 2 | D1-D3 |
| PA-001-4 | **Go SBOM 確認** — `go version -m` でビルドインSBOM出力確認 / `go.sum` SHA-256ハッシュ固定の検証 | @04-backend | 1 | D3 |

### Sprint 1 追加タスク

| ID | タスク名 | 担当 | SP | Day | マスタープラン根拠 |
|----|---------|------|-----|-----|------------------|
| P6-S1-A | **Go Shadow Mode 定量結果集計** — 不一致率 / P95レイテンシ / エラー率。**50件テストフィクスチャ（P1-P5境界値+品質ゲート）の TS/Go 完全一致確認** | @04-backend + @05-architect | 2 | D1-D3 | Phase 4: 3段階検証 |
| P6-S1-B | IMUセンサーメーカー技術確認 | PM | 1 | D1-D3 | Phase 3: GPS外部負荷 |
| P6-S1-C | Sprint 1 Go/No-Go 判定会議 | PM + 全エージェント | 1 | D10 | -- |

---

## 3. Go/No-Go チェックリスト

### 3-1. ビジネスインパクト（最重要）

| # | チェック項目 | Go 基準 | No-Go 対応 |
|---|------------|---------|-----------|
| **BG1** | 確定的スコア設計完了 | P1-P5統合 + Readiness正規化 + LLM分離文書が完成 | **Sprint 2 を Engine 設計に全振り** |
| **BG2** | プラン別ゲーティング方針確定 | Feature 5件のplan-gates割当がADR記録 | Sprint 2 Day 1-2 で確定 |
| **BG3** | ファクトベースROI指標定義完了 | inference_trace_logsからの抽出SQL + レポートテンプレート確定 | Sprint 2 冒頭で完了 |

### 3-2. マスタープラン原則遵守

| # | チェック項目 | Go 基準 | No-Go 対応 |
|---|------------|---------|-----------|
| **MP1** | A2原則（LLM非判定使用）が全設計文書で明示 | LLM責務分離文書がADR記録済み | **Sprint 2 Day 1 で緊急ADR作成** |
| **MP2** | サプライチェーン防衛（SBOM + Dependabot）がCI統合 | npm audit + SBOM生成がCIで動作 | Sprint 2 Day 1-2 で完了 |

### 3-3. 技術基盤

| # | チェック項目 | Go 基準 | No-Go 対応 |
|---|------------|---------|-----------|
| G5 | daily_metrics 拡張設計完了 | DDL + RLS + Migration | Sprint 2 Day 1-3 |
| G6 | ai_plan_jobs / weekly_plans 設計完了 | DDL + RLS + Migration | Sprint 2 Day 1-3 |
| G7 | Go Shadow Mode 不一致率 < 0.1% + 50フィクスチャ通過 | 集計結果が基準達成 | Go切替延期、TSフォールバック維持 |
| G8 | Cleanup 完了 | 廃止ルート削除 + DROP SQL配置 | Sprint 2 Day 1 で完了 |

---

## 4. Phase A-E マイルストーン（Week 1-12）

| Week | Sprint | マイルストーン | マスタープラン根拠 |
|------|--------|-------------|------------------|
| **W1-2** | S1 | 全設計完了 + Go/No-Go | Phase 1-5 整合確認 |
| **W3-4** | S2 | **Engine 実装完了** | Phase 3: 確定的パイプライン稼働 |
| **W5-6** | S3 | **Athlete UI リリース** | Phase 2: UI Firewall（摩擦ゼロ側）|
| **W7-8** | S4 | **Staff Dashboard リリース** | Phase 5: ファクトベースROI可視化 |
| **W9-10** | S5 | **AI Agent + Calendar リリース** | Phase 2: SaaSアップセル源泉 |
| **W11-12** | S6 | **統合テスト + セキュリティ監査** | Phase 5: エンタープライズ水準 |

### クリティカルパス

```
PB-001（確定的スコア設計）[P0]
  → Engine実装（S2）→ P1-P5 + Readiness 稼働
    → Athlete UI（S3）→ UI Firewall（摩擦ゼロ）→ DAU/MAU 60%
      → Dashboard（S4）→ ファクトベースROI → 更新率 95%
        → AI Agent + Calendar（S5）→ Pro差別化 → ARPU ¥400K
          → QA + 監査（S6）→ Phase 6 前半完了
```

---

## 5. Sprint 1 タイムライン

```
Day 1 (月):  ── P0 Engine + P3 Cleanup/Security 並行 ──
  [P0] @04-backend + @05-architect: PB-001-1 ハイブリッド・ピーキング計算仕様書 開始
  [P3] @04-backend: PA-001-1 廃止API一括削除
  [P3] @05-architect: PA-001-3 サプライチェーン防衛（.npmrc/Dependabot/SBOM）開始
  [P2] @05-architect: P6-003-1 ai_plan_jobs テーブル設計 開始
  [P2] @04-backend + @05-architect: PE-001-1 Calendar Function Calling 仕様 開始
  [--] @04-backend + @05-architect: P6-S1-A Go Shadow Mode 集計 開始
  [P1] @02-ui-ux: PC-001-3 AdaptiveCheckinForm（ランダム化含む）仕様 開始
  [--] PM: P6-S1-B IMUセンサーメーカー問合せ

Day 2 (火):
  [P3] PA-001-1 Cleanup 完了
  [P0] PB-001-1 計算仕様書 継続
  [P1] @02-ui-ux + @03-frontend: PD-001-1 4大KPIカード仕様 開始

Day 3 (水):  ── P0 計算仕様完了 → LLM分離文書着手 ──
  [P0] PB-001-1 計算仕様書 完了
  [P0] PB-001-2 P1-P5統合仕様 開始
  [P0] PB-001-3 LLM責務分離文書 開始
  [P3] PA-001-2 DROP SQL 作成
  [P3] PA-001-3 サプライチェーン防衛 完了（CI統合）
  [P3] PA-001-4 Go SBOM 確認
  [P2] P6-003-1 ai_plan_jobs 完了 → レビュー
  [P2] P6-003-2 weekly_plans 開始
  [--] P6-S1-A Go Shadow Mode レポート 完了
  [P1] PC-001-2 InsightCard（LLMフォールバック含む）仕様 開始
  [P1] PC-001-3 AdaptiveCheckinForm 仕様 完了
  [P1] PD-001-2 ファクトベースROIレポート仕様 開始

Day 4 (木):
  [P0] PB-001-4 daily_metrics 拡張設計 開始
  [P2] PE-001-1 Calendar 仕様 完了
  [P2] PE-001-2 ADR-027 開始
  [P1] PD-001-1 4大KPIカード 完了
  [P1] PC-001-1 ConditionCircleRing（MetricLabel二層表現含む）開始

Day 5 (金):
  [P0] PB-001-2 P1-P5統合仕様 完了
  [P0] PB-001-3 LLM責務分離文書 完了 → ADR記録
  [P0] PB-001-5 段階的Z-Score + 傾向通知確認 開始
  [P2] PE-001-2 ADR-027 完了
  [P2] P6-003-2 weekly_plans 完了
  [P2] P6-003-3 マイグレーション作成
  [P1] PC-001-2 InsightCard 仕様 完了
  [P1] PD-001-2 ROIレポート 完了
  [P1] PD-001-3 チャート仕様 開始
  [P1] PD-001-4 アップグレードCTA仕様 開始

--- Week 2 ---

Day 6 (月):
  [P0] PB-001-4 daily_metrics 拡張 完了
  [P0] PB-001-5 段階的Z-Score 確認 完了
  [P2] P6-003-3 マイグレーション レビュー完了
  [P1] PC-001-1 ConditionCircleRing 継続

Day 7 (火):  ── P0 Engine 設計完了 ──
  [P0] PB-001-4 plan-gates 拡張仕様 完了 → ADR記録 ★ P0 完了
  [P1] PC-001-1 Athlete UI 仕様 完了
  [P1] PD-001-3 チャート仕様 完了
  [P1] PD-001-4 アップグレードCTA 完了
  [P1] PC-001-4 トライアル転換タッチポイント 開始

Day 8-9 (水-木):
  [P1] PC-001-4 転換タッチポイント 完了
  全エージェント: 最終レビュー + A1/A2/A3 原則遵守確認

Day 10 (金):
  P6-S1-C: Sprint 1 Go/No-Go 判定会議（BG1-BG3 + MP1-MP2 + G5-G8）
```

---

## 6. リスク管理

| # | リスク | 影響 | **マスタープラン上の位置づけ** | 緩和策 |
|---|--------|------|---------------------------|--------|
| R1 | Readiness 正規化パラメータが実データに不適合 | DAU定着遅延 | Phase 3: 確定的モデルの精度 | Sprint 2 で実データ検証 |
| R2 | LLM責務分離の境界が曖昧 | A2原則違反リスク | Phase 1: 絶対原則 | PB-001-3 でADR化し境界を厳格固定 |
| R3 | Standard→Pro ゲーティング境界が不適切 | チャーン or 収益流出 | Phase 2: B2Bマネタイズ | 初期は保守的（多めにProに含める）|
| R4 | サプライチェーン攻撃 | エンタープライズ信頼毀損 | Phase 5: Supply Chain Security | SBOM + Dependabot + npm audit CI |
| R5 | Go Shadow Mode 不一致率超過 | Go切替遅延 | Phase 4: 段階的ロールアウト | TSフォールバック維持。影響なし |

---

## 7. 担当エージェント別ワークロード

| エージェント | SP | 主要担当 | マスタープラン責任 |
|------------|-----|---------|------------------|
| @04-backend | 13 | Engine設計 / Cleanup / Go集計 | Phase 3 確定的パイプライン |
| @05-architect | 12 | AI DB設計 / ADR / サプライチェーン | Phase 4-5 基盤堅牢化 |
| @02-ui-ux | 7 | Athlete UI / Dashboard / CTA | Phase 2 UI Firewall |
| @03-frontend | 4 | UI仕様レビュー / チャート選定 | Phase 2 UI Firewall |
| @06-data-engineer | 3 | テーブル設計 / daily_metrics | Phase 3 データ層 |
| PM | 2 | IMU問合せ / Go/No-Go | -- |

---

## 8. Phase 6 前半 KPI目標（Sprint 6 完了時）

| KPI | 現在 | 目標 | マスタープラン根拠 |
|-----|------|------|------------------|
| **MRR** | ¥6M | ¥8M | Phase 2: B2Bマネタイズ |
| **ARPU** | ¥300K | ¥350K | Phase 2: SaaSアップセル |
| **チャーン** | ~4% | ≤3% | Phase 5: ROI証明 → 解約防止 |
| **DAU/MAU** | 未計測 | 60%+ | Phase 2: UI Firewall → 摩擦ゼロ |
| **チェックイン率** | ~75% | 85%+ | Phase 2: Bio-Swipeランダム化 |
| **P2検知→負荷調整アシスト件数** | 未計測 | 月15件+ | Phase 5: ファクトベースROI |
| **NPS** | 未計測 | 40+ | Phase 5: エンタープライズ信頼 |

---

## 9. 変更履歴

| 日付 | Ver | 変更内容 |
|------|-----|---------|
| 2026-04-01 | 1.0 | 初版作成 |
| 2026-04-01 | 2.0 | v3.2 変更指示書整合。TeleHealth/Billing 削除 |
| 2026-04-01 | 3.0 | ビジネスモデル最適化。収益ドライバー紐付け + plan-gates方針 |
| 2026-04-01 | 4.0 | **マスタープラン Phase 1-5 完全整合:** §0-1 絶対原則(A1-A3)追加、PB-001 にLLM責務分離+P1-P5統合+段階的Z-Score追加、PD-001 をファクトベースROI(inference_trace_logs)に強化、PC-001 にMetricLabel二層表現+Bio-Swipeランダム化追加、PA-001 にサプライチェーン防衛(SBOM/Dependabot)追加、Go/No-Go にMP1-MP2(マスタープラン原則遵守)追加、P6-S1-A に50件テストフィクスチャ追加 |

---

## 自律連鎖トリガー

**オーナーへの確認依頼:**

1. **プラン別ゲーティング方針:** コンディション・スコア=全プラン、InsightCard/Calendar/AI Agent=Pro以上。承認するか？
2. **Standard ダッシュボード制限:** 4大KPIのうち2項目（Critical + Availability）のみ。3項目にすべきか？
3. **LLM責務分離のADR記録:** Node 0-4 への LLM 介入を永続的に禁止する ADR を Sprint 1 で確定してよいか？
4. Go Shadow Mode APM/ログアクセス権限は付与済みか？
