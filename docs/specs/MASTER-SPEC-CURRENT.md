# PACE Platform マスター仕様書
## Performance Analytics & Conditioning Engine

**バージョン**: v6.3
**最終更新**: 2026-04-04
**対象競技**: サッカー / 野球 / バスケットボール / ラグビー / その他
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
9. [アセスメント・フロー](#9-アセスメントフロー)
10. [介入シミュレータ](#10-介入シミュレータ)
11. [競技別プロファイル（v6.2）](#11-競技別プロファイル)
12. [プラン別機能ゲート](#12-プラン別機能ゲート)
13. [データベース設計](#13-データベース設計)
14. [API一覧](#14-api一覧)
15. [認証・セキュリティ](#15-認証セキュリティ)
16. [外部サービス連携](#16-外部サービス連携)
17. [環境変数](#17-環境変数)
18. [実装計画](#18-実装計画)

---

## 1. プロダクト概要

### PACEとは

PACEは、スポーツチームのアスレティックトレーナー（AT）やコーチが、選手のコンディションを科学的に管理するためのWebアプリケーションです。サッカー・野球・バスケットボール・ラグビーに対応し、競技特性に最適化された閾値とパラメータで動作します。

選手が毎日入力する「体の調子」データをもとに、推論パイプラインが「今日トレーニングしても大丈夫か」を4色（緑・黄・橙・赤）で判定します。

### コアフロー

```
選手 Daily Input → 推論パイプライン(自動) → ダッシュボード表示
                                            ├→ Active選手: アセスメント → コンディショニング・シミュレータ
                                            └→ Rehab選手:  リハビリ評価 → リハビリ・シミュレータ
```

- **トリアージは選手のDaily Inputが担う**: 毎日の NRS / 疲労 / 睡眠 / sRPE 入力がそのまま P1-P5 自動判定の入力
- **アセスメントは3軸**: 負荷集中 × 運動効率 × 疼痛パターン（急性外傷評価は対象外）
- **シミュレータは2トラック**: Active選手はコンディショニング観点、Rehab選手は回復判定・リハビリ種目効果予測
- **SOAP ノートのAI補助はProプラン限定**

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
| **platform_admin** | プラットフォーム管理画面（`/platform-admin`）のみ。顧客の個別データ閲覧は**不可**（情報秘匿性） |
| **master** | 全機能 + スタッフ管理 + チーム管理 + 請求管理（自組織内） |
| **AT / PT / S&C** | 全選手の閲覧・評価・SOAP・リハビリ・ロック操作 |
| **選手（athlete）** | 自分のデータの閲覧・チェックイン入力のみ |

**RLS**: `get_my_org_id()`（SECURITY DEFINER）で組織分離。選手は `user_id = auth.uid()` のみ。`platform_admin` は集計ビューのみアクセス可。

---

## 5. 画面一覧

### スタッフ画面（PC）— 5アクションハブ

| ハブ | URL | 含まれる機能 |
|------|-----|------------|
| **チーム** | `/dashboard` | KPI、コンディション一覧、負荷集中度、要確認選手リスト、リハビリ中選手 |
| **選手** | `/athletes/[id]` | 選手詳細: アセスメント（4タブ）、推移チャート、既往歴 |
| **計画** | `/training` | トレーニングメニュー生成・承認 |
| **シミュレータ** | `/simulator` | コンディショニング・シミュレータ / リハビリ・シミュレータ |
| **Analytics** | `/reports` | チーム・個人レポート生成 |

ユーティリティ: コミュニティ / 設定 / 管理（masterのみ: スタッフ・チーム・請求）

### プラットフォーム管理画面（Desktop）— platform_admin専用（v6.3 追加）

| 画面 | URL | 含まれる機能 |
|------|-----|------------|
| **ダッシュボード** | `/platform-admin` | 全体KPIサマリー（契約数・MRR・未払い・エラー・利用率） |
| **決済状況** | `/platform-admin/billing` | Stripe請求一覧、未払い/Dunning、MRR推移 |
| **契約チーム＋プラン** | `/platform-admin/teams` | 組織一覧、プラン情報、プラン変更依頼管理 |
| **システムエラー** | `/platform-admin/errors` | APIエラー率推移、Sentry連携、エンジン稼働状況 |
| **推論エンジン監視** | `/platform-admin/engine` | Go/TS切替、レイテンシ、Shadow Mode結果 |
| **利用率** | `/platform-admin/usage` | DAU/MAU、チェックイン率、機能別利用率 |
| **エンジン成長率** | `/platform-admin/engine-growth` | データ蓄積量、推論精度推移、データ品質スコア |

### ダッシュボード詳細（`/dashboard`）

| セクション | 内容 | プラン |
|-----------|------|--------|
| **入力率** | 当日チェックイン率、未入力者リスト | 全プラン |
| **チーム負荷サマリー** | 平均ACWR、平均Monotony、負荷集中度（上位N名の寄与率） | Standard+ |
| **要確認選手** | P1-P4 検出選手カード（推移ミニチャート付き）→ 「アセスメント」ボタン | 全プラン |
| **リハビリ中選手** | Phase進捗、回復度、NRS推移 → 「リハビリ評価」ボタン | 全プラン |
| **良好選手** | 折りたたみ表示 | 全プラン |

### 選手画面（モバイルPWA）— 5タブ

| タブ | URL | 内容 |
|------|-----|------|
| **ホーム** | `/home` | GlowingCore + AIサマリ + MetricLabel + コンパス |
| **入力** | `/checkin` | Bio-Swipe → スライダーフォーム（トリアージの代替。毎朝通知） |
| **履歴** | `/history` | トレンドチャート + 30日カレンダーヒートマップ |
| **スキャン** | `/scanner` | カメラ解析（スマートスキャナー） |
| **マイ** | `/profile` | プロフィール、データ蓄積、ログアウト |

### Daily Input → トリアージ自動化

選手の毎日のチェックイン入力がトリアージそのもの。パイプラインが自動でP1-P5を判定しダッシュボードに反映。

| 検知パターン | 優先度 | ダッシュボード表示 |
|------------|--------|---------------|
| NRS ≥ 8 + 安静時HR急増 | P1 | 即時確認カード |
| ACWR > 閾値 or Monotony > 閾値 | P2 | 負荷リスクカード |
| Decoupling 高値 | P3 | 効率低下カード |
| Z-Score ≤ -1.5 が 2項目以上 | P4 | 蓄積疲労カード |
| 全指標正常 | P5 | 良好リスト |

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
| ACWR | 上昇 | 競技別閾値 |
| 単調性 | 上昇 | 競技別閾値 |
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

## 9. アセスメント・フロー

### 9-1. 設計思想

- **急性外傷評価は対象外**: PACEはコンディショニング・マネジメントに特化
- **トリアージは Daily Input が担う**: 選手の毎日の入力 → パイプライン自動判定が従来のトリアージ
- **3軸評価**: 負荷集中 × 運動効率 × 疼痛パターン
- **2トラック制**: Active選手とRehab選手で異なるフロー

### 9-2. フロー全体像

```
選手 Daily Input (PWA /checkin)
  │ NRS, 疲労, 睡眠, sRPE, ボディマップ
  ▼
v6 推論パイプライン (自動実行)
  │ P1-P5 判定, 特徴量計算, ベイズ更新
  │
  ├─── Active 選手 ──────────────── Rehab 選手 ─────────┐
  ▼                                                     ▼
ダッシュボード /dashboard              リハビリダッシュボード
├ チーム負荷サマリー                    ├ 回復進捗一覧
├ 負荷集中度                           ├ Phase別ステータス
├ 要確認選手リスト                      └ 復帰予定
│                                                       │
▼                                                       ▼
アセスメント                           リハビリアセスメント
/athletes/[id]/assessment              /athletes/[id]/rehab-assessment
├ Tab 1: 負荷集中分析                   ├ 回復度スコア
├ Tab 2: 運動効率分析                   ├ 復帰基準チェック
├ Tab 3: 疼痛パターン分析               ├ NRS/ROM/機能テスト推移
├ Tab 4: 総合評価                       └ Phase移行判定
│                                                       │
▼                                                       ▼
コンディショニング・シミュレータ         リハビリ・シミュレータ
/simulator/conditioning                /simulator/rehab
├ 負荷シナリオ設定                      ├ リハビリ種目追加/除外
├ ACWR/Monotony 推移予測                ├ 組織負荷シミュレーション
├ 組織回復カーブ                        ├ 復帰基準達成予測
└ 判定シミュレーション                   └ 再受傷リスク推移
```

### 9-3. Active選手アセスメント — 4タブ構成

#### Tab 1: 負荷集中分析

| 表示項目 | データソース | 可視化 |
|---------|-------------|--------|
| ACWR 推移（28日間） | daily_metrics → EWMA計算 | 折れ線 + 閾値ライン + Sweet Spotゾーン |
| 急性/慢性負荷 内訳 | EWMA (λ_acute, λ_chronic) | 数値 + 前週比% |
| Monotony & Strain 推移 | 週間 SD(sRPE) / Mean(sRPE) | 棒グラフ + 閾値ライン |
| 組織別 負担蓄積 | 組織損傷モデル (halfLife別) | 横棒ゲージ（代謝/軟部/骨関節/神経筋） |
| Preparedness スコア | Fitness - Fatigue | 折れ線 + 基準線(0) |

#### Tab 2: 運動効率分析

| 表示項目 | データソース | 可視化 |
|---------|-------------|--------|
| 心拍-負荷 デカップリング | HR / sRPE 比の時系列変化 | 折れ線 + 閾値 |
| 主観-客観ギャップ | sRPE vs HR-based負荷 | テーブル（日次ギャップ%） |
| ウェルネス Z-Score レーダー | 睡眠/疲労/体調/ストレス/気分のZ値 | レーダーチャート + P4検出表示 |
| パフォーマンス効率指標 | 出力/心拍コスト, sRPE/実負荷比, 回復心拍, 睡眠効率 | KPIカード（個人平均比較） |
| 総合効率スコア (0-100) | 上記4指標の複合 | 数値 + 前週/前月比 |

#### Tab 3: 疼痛パターン分析

| 表示項目 | データソース | 可視化 |
|---------|-------------|--------|
| NRS 推移 × 負荷相関 | daily_metrics (NRS, sRPE) | 2軸折れ線 + 相関係数 |
| ボディマップ × 時系列 | daily_metrics (pain_locations) | 人体図の時系列スナップショット |
| 疼痛パターン検出 | 連続上昇/新規出現/部位集中 | アラートテキスト |
| 既往歴との照合 | medical_history テーブル | 照合結果 + リスク乗数更新推奨 |
| 代償パターン検出 | 同側/近接部位の疼痛連鎖分析 | 運動連鎖図 |

#### Tab 4: 総合評価

| 表示項目 | データソース | 可視化 |
|---------|-------------|--------|
| リスクサマリー | パイプライン出力全体 | 要因別寄与度バー（%） |
| ベイズ事後確率 | Node 3 出力 | 確率 + CI + 信頼度レベル |
| スタッフ所見 | スタッフ手入力 | カテゴリ選択 + 自由記述 |
| AI所見補助 (**Pro**) | Gemini生成 | サジェストカード（採用/修正/無視） |
| 推奨アクション | パイプライン + スタッフ判断 | チェックリスト |

**評価カテゴリ選択肢:**
- 過負荷（オーバーリーチング初期）
- 蓄積疲労（非機能的オーバーリーチング）
- 疼痛管理必要
- 経過観察のみ

### 9-4. Rehab選手アセスメント

| 表示項目 | 内容 |
|---------|------|
| **回復進捗バー** | Phase 1-4 のどこにいるか + Day数 + 回復度スコア(0-100) |
| **NRS推移** | 受傷日からの痛みトレンド（改善傾向の可視化） |
| **復帰基準チェック** | Phase移行に必要な基準の達成/未達成（ROM, 機能テスト等） |
| **Phase移行判定** | 達成率% + 予測達成日 |

### 9-5. AI SOAP補助（Proプラン限定）

```
Free / Standard:
├ パイプライン特徴量の自動表示
├ テンプレート自動展開（評価カテゴリ別）
└ 構造化入力フォーム

Pro（AI補助追加）:
├ S: 自由記述 → 構造化テキスト変換（音声入力対応）
├ O: 所見入力に基づく追加評価サジェスト
├ A: S+Oの全データから鑑別リスト + 重症度サジェスト + 既往歴照合
├ P: エビデンスベース介入プラン + フォローアップ日程提案
└ SOAP最終整形・PDF出力
```

**AI設計原則:**
- AI は「提案」のみ。最終判断は常にスタッフ
- 全サジェストに [採用] [修正して採用] [無視] の3択
- AIの出力は判定ロジックに一切影響しない（テキスト整形のみ）

---

## 10. 介入シミュレータ

### 10-1. コンディショニング・シミュレータ（Active選手用）

**目的**: 「もし明日からこの負荷に変更したら、何日後に安全域に戻るか？」

#### 入力パラメータ

| パラメータ | 範囲 | 説明 |
|-----------|------|------|
| シミュレーション期間 | 3-14日 | 予測期間 |
| 日次 sRPE | 0-1000 | シナリオごとの負荷設定 |
| 練習種別 | 通常/修正/リハビリ/休養 | 負荷カテゴリ |

#### 出力（シナリオ比較）

| 予測項目 | 計算方法 |
|---------|---------|
| ACWR 推移 | EWMA (λ_acute, λ_chronic) の前方予測 |
| Monotony 推移 | 7日間 SD/Mean の前方予測 |
| 組織回復カーブ | halfLife ベースの指数減衰予測 |
| 判定シミュレーション | 各日の P1-P5 再判定 |
| Sweet Spot 復帰予測日 | ACWR 0.8-1.3 到達日 |

#### 推奨ロジック

- **ACWR**: 急な負荷落差は復帰時の re-spike リスクを高める → 漸減を推奨
- **Monotony**: 負荷を下げるだけでなく日次変動を入れることで効果的に低下
- 複数シナリオ比較時は「復帰速度 × 再発リスク」のバランスで推奨度を算出

### 10-2. リハビリ・シミュレータ（Rehab選手用）

**目的**: 「このリハビリ種目を追加/変更したら、復帰タイムラインはどう変わるか？」

#### 機能

| 機能 | 内容 |
|------|------|
| **リハビリ種目シミュレーション** | 種目を追加/除外した場合の組織負荷推移予測 |
| **組織安全上限チェック** | 種目追加時に対象組織の負荷が安全上限(0.3)を超えないか |
| **復帰基準達成予測** | 現在の回復ペースで Phase 移行・フル復帰がいつになるか |
| **再受傷リスク推移** | 復帰タイムラインに沿った再受傷確率の変化 |
| **段階的負荷増加計画** | 安全上限内での最適な種目追加タイミング提案 |

#### リハビリ種目マスタ

各種目に対して以下のパラメータを定義:
- `target_tissue`: 対象組織（MCL, ACL, hamstring 等）
- `intensity_level`: low / medium / high
- `tissue_load`: 対象組織への負荷係数 (0.0-1.0)
- `expected_effect`: ROM↑, 筋力↑, 固有覚↑ 等
- `min_phase`: 最低導入フェーズ (1-4)
- `contraindications`: 禁忌タグ

### 10-3. 既存APIとの連携

| 新機能 | 利用する既存API | 拡張内容 |
|--------|---------------|---------|
| コンディショニング・シミュレータ | `/api/v6/simulate` | シナリオ比較 + ACWR/Monotony推移予測 |
| コンディショニング・シミュレータ | `/api/counterfactual/evaluate` | do-calculus による介入効果予測 |
| リハビリ・シミュレータ | `/api/dbn/simulate` | 前方伝播による復帰予測 |
| リハビリ・シミュレータ | `/api/rts/predict` | RTPタイムライン予測 |
| リハビリ・シミュレータ | `/api/rehab/programs` | Phase管理 + Gate判定 |

---

## 11. 競技別プロファイル（v6.2）

### 11-1. SportProfile 構造

チーム登録時に競技を選択。選択された競技に応じて推論パイプラインの閾値・パラメータが自動適用。

| パラメータ | soccer | baseball | basketball | rugby | other |
|-----------|--------|----------|------------|-------|-------|
| ACWR閾値 | 1.50 | 1.30 | 1.40 | 1.50 | 1.50 |
| Monotony閾値 | 2.00 | 2.50 | 2.00 | 2.00 | 2.00 |
| 痛み閾値調整 | 0 | 0 | 0 | +1 | 0 |
| EWMA急性(日) | 7 | 7 | 7 | 7 | 7 |
| EWMA慢性(日) | 28 | 42 | 28 | 28 | 28 |
| コンタクトスポーツ | No | No | No | Yes | No |

### 11-2. 実装済みファイル

- Go: `pace-inference/internal/config/sport_profiles.go`, `internal/domain/sport.go`
- TS: `pace-platform/lib/engine/v6/config/sport-profiles.ts`
- 関数: `configForSport(sport)` → 競技最適化された PipelineConfig を返す

---

## 12. プラン別機能ゲート

| 機能 | Free相当 | Standard | Pro | Pro+CV | Enterprise |
|------|---------|----------|-----|--------|------------|
| Daily Input (選手側) | ✓ | ✓ | ✓ | ✓ | ✓ |
| パイプライン自動判定 | ✓ | ✓ | ✓ | ✓ | ✓ |
| ダッシュボード（基本） | ✓ | ✓ | ✓ | ✓ | ✓ |
| チーム負荷サマリー | - | ✓ | ✓ | ✓ | ✓ |
| アセスメント 負荷集中タブ | 簡易版 | ✓ | ✓ | ✓ | ✓ |
| アセスメント 運動効率タブ | - | ✓ | ✓ | ✓ | ✓ |
| アセスメント 疼痛パターンタブ | 簡易版 | ✓ | ✓ | ✓ | ✓ |
| アセスメント 総合評価タブ | - | ✓ | ✓ | ✓ | ✓ |
| AI SOAP補助 | - | - | ✓ | ✓ | ✓ |
| コンディショニング・シミュレータ | - | 2シナリオ | 無制限 | 無制限 | 無制限 |
| リハビリ・シミュレータ | - | 基本版 | ✓ | ✓ | ✓ |
| リハビリ種目効果予測 | - | - | ✓ | ✓ | ✓ |
| AI介入提案 | - | - | ✓ | ✓ | ✓ |
| CV解析 | - | - | - | ✓ | ✓ |
| PDF出力 | - | - | ✓ | ✓ | ✓ |
| 複数チーム管理 | - | - | - | - | ✓ |

**Feature Gate 実装**: `lib/billing/plan-gates.ts` の `canAccess()` で制御

---

## 13. データベース設計

### 主要テーブル（55+マイグレーション）

| カテゴリ | テーブル | 説明 |
|---------|---------|------|
| **組織** | organizations (sport列追加), teams, staff, athletes | マルチテナント + 競技別 |
| **日次データ** | daily_metrics, session_logs, coaching_history | チェックイン + セッション + AI履歴 |
| **GPS** | gps_session_loads | Catapult/STATSports連携 |
| **評価** | assessments, assessment_nodes, soap_notes | アセスメント + SOAP |
| **リハビリ** | rehab_programs, rehab_phase_gates, rehab_exercises, rehab_prescriptions, athlete_locks | RTP + 種目マスタ + 処方 |
| **推論** | inference_trace_logs, athlete_condition_cache | 監査証跡 + キャッシュ |
| **課金** | subscriptions, stripe_events, dunning_schedules | Stripe連携 |
| **ビュー** | v_wellness_consecutive_decline | P3判定用ウェルネス悪化追跡 |

### 新規テーブル（v6.2）

#### conditioning_assessments（コンディショニングアセスメント）

```sql
CREATE TABLE conditioning_assessments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      UUID NOT NULL REFERENCES athletes(id),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  staff_id        UUID NOT NULL REFERENCES staff(id),
  trace_id        UUID,                      -- 当日の推論結果と紐付け
  pipeline_decision TEXT,
  pipeline_priority TEXT,
  -- 3軸分析結果
  load_analysis       JSONB,                 -- ACWR, Monotony, Strain, 組織負担
  efficiency_analysis JSONB,                 -- デカップリング, 主観客観Gap, Z-Score
  pain_analysis       JSONB,                 -- NRS推移, 相関, ボディマップ, 既往照合
  -- 総合評価
  risk_category   TEXT CHECK (risk_category IN (
    'overreaching', 'accumulated_fatigue', 'pain_management', 'observation'
  )),
  staff_notes     TEXT,
  ai_suggestion   JSONB,                     -- Pro: AI生成サジェスト
  ai_adopted      BOOLEAN DEFAULT false,
  -- シミュレータ
  selected_scenario  JSONB,
  simulation_params  JSONB,
  feature_snapshot   JSONB,                  -- アセスメント時点の特徴量スナップショット
  status          TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'reviewed')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ
);
```

#### rehab_exercises（リハビリ種目マスタ）

```sql
CREATE TABLE rehab_exercises (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  name_en         TEXT,
  category        TEXT NOT NULL,              -- 'OKC', 'CKC', 'balance', 'agility', 'sport_specific'
  target_tissue   TEXT NOT NULL,              -- 'MCL', 'ACL', 'hamstring' 等
  intensity_level TEXT CHECK (intensity_level IN ('low', 'medium', 'high')),
  tissue_load     JSONB NOT NULL,             -- { "target": 0.3, "adjacent": 0.1 }
  expected_effect JSONB,                      -- { "ROM": "+", "strength": "++" }
  min_phase       SMALLINT DEFAULT 1,
  contraindications TEXT[],
  sport_tags      TEXT[],                     -- 競技タグ（フィルタリング用）
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

#### rehab_prescriptions（リハビリ処方）

```sql
CREATE TABLE rehab_prescriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      UUID NOT NULL REFERENCES rehab_programs(id),
  athlete_id      UUID NOT NULL REFERENCES athletes(id),
  exercise_id     UUID NOT NULL REFERENCES rehab_exercises(id),
  start_day       SMALLINT NOT NULL,
  sets            SMALLINT,
  reps            SMALLINT,
  notes           TEXT,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## 14. API一覧

### コア機能

| メソッド | URL | 説明 |
|---------|-----|------|
| POST | `/api/checkin` | 日次チェックイン（トリアージの入力源） |
| GET | `/api/conditioning/{athleteId}` | コンディションスコア |
| GET | `/api/athlete/home-data/{athleteId}` | モバイルホーム統合データ |
| POST | `/api/pipeline` | v6推論パイプライン実行（競技別設定自動適用） |
| POST | `/api/pipeline/baseline-reset` | ベースラインリセット |
| POST | `/api/pipeline/team-anomaly` | チーム全体異常検知 |

### アセスメント

| メソッド | URL | 説明 |
|---------|-----|------|
| GET | `/api/assessment/conditioning/{athleteId}` | **[新規]** 3軸分析データ取得 |
| POST | `/api/assessment/conditioning` | **[新規]** コンディショニングアセスメント保存 |
| GET | `/api/assessment/rehab/{athleteId}` | **[新規]** リハビリアセスメントデータ取得 |
| POST | `/api/assessment/start` | CAT アセスメント開始（既存） |
| POST | `/api/assessment/answer` | CAT 回答送信（既存） |

### SOAP

| メソッド | URL | 説明 |
|---------|-----|------|
| GET/POST | `/api/soap` | SOAPノートCRUD |
| POST | `/api/soap/generate` | AI SOAP生成（Pro限定） |

### シミュレータ

| メソッド | URL | 説明 |
|---------|-----|------|
| POST | `/api/simulator/conditioning` | **[新規]** コンディショニング・シミュレータ |
| POST | `/api/simulator/rehab` | **[新規]** リハビリ・シミュレータ |
| POST | `/api/v6/simulate` | v6シミュレーション（既存、内部利用） |
| POST | `/api/counterfactual/evaluate` | What-Ifシミュレーション（既存、内部利用） |
| POST | `/api/dbn/simulate` | 動的ベイジアンネットワーク（既存、内部利用） |
| POST | `/api/rts/predict` | 復帰予測（既存、内部利用） |

### リハビリ

| メソッド | URL | 説明 |
|---------|-----|------|
| GET/POST | `/api/rehab/programs` | リハビリプログラムCRUD |
| POST | `/api/rehab/programs/{id}/gate` | フェーズゲートチェック |
| GET | `/api/rehab/exercises` | **[新規]** リハビリ種目マスタ取得 |
| POST | `/api/rehab/menu` | リハビリメニュー生成 |
| GET/POST | `/api/rehab/prescriptions` | **[新規]** リハビリ処方CRUD |

### 管理

| メソッド | URL | 説明 |
|---------|-----|------|
| GET/POST | `/api/admin/staff` | スタッフ管理 |
| GET/POST | `/api/admin/teams` | チーム管理 |
| GET/POST | `/api/locks` | 活動制限ロック |
| GET/POST | `/api/reports/athlete` | 個人レポート |
| GET/POST | `/api/reports/team` | チームレポート |

---

## 15. 認証・セキュリティ

### ログインURL完全分離（v6.3 追加）

| 対象 | URL | 遷移先 |
|------|-----|--------|
| スタッフ | `/auth/login` | `/dashboard` |
| 選手 | `/auth/athlete-login` | `/home` |
| プラットフォーム管理者 | `/auth/admin-login` | `/platform-admin` |

**選手兼スタッフ:** スタッフURLでログイン → ヘッダーに「選手ビュー切替」トグル表示。選手URLでログイン → スタッフビューへの切替不可。

**選手セルフサインアップ:** `/auth/athlete-login` → 新規登録 → Magic Link → チームコード入力 → 組織紐付け。チームコードには有効期限・使用回数制限・注意喚起UI必須。

### 認証フロー

```
/auth/login          → スタッフ認証 → staff テーブル確認 → /dashboard
                       （athletes にもレコードあり → ヘッダーに選手ビュー切替トグル表示）
/auth/athlete-login  → 選手認証 → athletes テーブル確認 → /home
                       （スタッフビューへの切替不可）
/auth/admin-login    → 管理者認証 → platform_admins テーブル確認 → /platform-admin
                       （/platform-admin 以外へのアクセスはブロック）
```

### セキュリティ対策

| 対策 | 状態 |
|------|------|
| RLS（全テーブル） | ✅ org_id分離 + user_id分離 |
| CSP（unsafe-eval除去済） | ✅ |
| HSTS（max-age=63072000） | ✅ |
| 入力バリデーション | ✅ validateUUID, sanitizeString |
| Geminiガードレール | ✅ 3層（サニタイズ→有害検出→出力検証） |
| レートリミット | ✅ Gemini 20req/min, S2S 100req/hour |
| npm脆弱性 | ✅ 本番影響ゼロ |

---

## 16. 外部サービス連携

| サービス | 用途 | 認証 |
|---------|------|------|
| Supabase | DB + 認証 | Service Role Key / Anon Key |
| Gemini 2.0 Flash | テキスト整形（判定不使用） | API Key |
| Stripe | サブスクリプション | Secret Key + Webhook Secret |
| Google Calendar | スケジュール同期 | OAuth 2.0 |
| Slack | アラート通知 | Webhook |
| Sentry | エラー監視 | DSN Token |

---

## 17. 環境変数

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

## 18. 実装計画

### Sprint 1 ✅ 完了 — SportProfile 基盤

| タスク | 状態 |
|--------|------|
| Go SportProfile 実装 (5競技) | ✅ |
| TS SportProfile ミラー実装 | ✅ |
| `configForSport()` 関数 (Go/TS) | ✅ |
| パイプラインAPI 競技別設定適用 | ✅ |
| オンボーディングAPI 競技保存 (BUG-11) | ✅ |
| DB: organizations.sport 列追加 | ✅ |
| MASTER-SPEC v6.2 統合 | ✅ |

### Sprint 2 — アセスメント基盤 + DB

**目標**: アセスメント画面のデータ基盤とAPI

| # | タスク | SP | 依存 |
|---|--------|-----|------|
| 2-1 | DB マイグレーション: conditioning_assessments テーブル | 3 | - |
| 2-2 | DB マイグレーション: rehab_exercises, rehab_prescriptions テーブル | 3 | - |
| 2-3 | API: `GET /api/assessment/conditioning/{athleteId}` — 3軸分析データ集約 | 5 | 2-1 |
| 2-4 | API: `POST /api/assessment/conditioning` — アセスメント保存 | 3 | 2-1 |
| 2-5 | API: `GET /api/assessment/rehab/{athleteId}` — リハビリアセスメントデータ | 3 | 2-2 |
| 2-6 | リハビリ種目マスタデータ投入 (seed) | 2 | 2-2 |
| 2-7 | plan-gates に assessment 系 Feature 追加 | 2 | - |
| **計** | | **21** | |

### Sprint 3 — ダッシュボード強化 + アセスメントUI

**目標**: ダッシュボードにチーム負荷サマリー追加、アセスメント画面構築

| # | タスク | SP | 依存 |
|---|--------|-----|------|
| 3-1 | ダッシュボード: チーム負荷サマリーコンポーネント | 5 | - |
| 3-2 | ダッシュボード: 要確認選手カード（推移ミニチャート） | 5 | - |
| 3-3 | ダッシュボード: リハビリ中選手セクション | 3 | - |
| 3-4 | アセスメント Tab 1: 負荷集中分析 (ACWR/Monotony/組織チャート) | 8 | S2 |
| 3-5 | アセスメント Tab 2: 運動効率分析 (デカップリング/Z-Scoreレーダー) | 8 | S2 |
| **計** | | **29** | |

### Sprint 4 — アセスメント完成 + シミュレータAPI

**目標**: アセスメント残りタブ + シミュレータバックエンド

| # | タスク | SP | 依存 |
|---|--------|-----|------|
| 4-1 | アセスメント Tab 3: 疼痛パターン分析 (NRS相関/ボディマップ/既往照合) | 8 | S3 |
| 4-2 | アセスメント Tab 4: 総合評価 (リスクサマリー/スタッフ所見) | 5 | S3 |
| 4-3 | API: `POST /api/simulator/conditioning` — シナリオ比較エンジン | 8 | S2 |
| 4-4 | API: `POST /api/simulator/rehab` — リハビリ種目シミュレーション | 8 | S2 |
| 4-5 | リハビリアセスメントUI (回復進捗/復帰基準チェック) | 5 | S2 |
| **計** | | **34** | |

### Sprint 5 — シミュレータUI

**目標**: シミュレータ画面の構築

| # | タスク | SP | 依存 |
|---|--------|-----|------|
| 5-1 | コンディショニング・シミュレータUI (シナリオ設定/チャート/判定予測) | 13 | S4 |
| 5-2 | リハビリ・シミュレータUI (種目管理/負荷チャート/復帰予測) | 13 | S4 |
| 5-3 | シミュレータ → アセスメント連携 (シナリオ採用→評価に反映) | 3 | 5-1, 5-2 |
| **計** | | **29** | |

### Sprint 6 — AI補助 + 統合テスト

**目標**: Pro限定AI機能 + E2Eテスト + 品質保証

| # | タスク | SP | 依存 |
|---|--------|-----|------|
| 6-1 | AI SOAP補助 (S/O構造化 + A鑑別 + P計画生成) | 8 | S4 |
| 6-2 | AI 総合評価サジェスト (Tab 4) | 5 | S4 |
| 6-3 | AI 介入提案 (シミュレータ推奨ロジック) | 5 | S5 |
| 6-4 | E2Eテスト: アセスメントフロー全体 | 5 | S5 |
| 6-5 | E2Eテスト: シミュレータフロー全体 | 5 | S5 |
| 6-6 | PDF出力 (Pro) | 3 | 6-1 |
| **計** | | **31** | |

### 全体サマリー

| Sprint | 内容 | SP | 状態 |
|--------|------|-----|------|
| **S1** | SportProfile 基盤 | 21 | ✅ 完了 |
| **S2** | アセスメント基盤 + DB | 21 | 次回着手 |
| **S3** | ダッシュボード強化 + アセスメントUI前半 | 29 | - |
| **S4** | アセスメント完成 + シミュレータAPI | 34 | - |
| **S5** | シミュレータUI | 29 | - |
| **S6** | AI補助 + 統合テスト | 31 | - |
| **合計** | | **165 SP** | |

---

## 付録A: Go推論エンジン（pace-inference/）

```
pace-inference/
  cmd/server/main.go           ← HTTP サーバー（graceful shutdown）
  internal/
    domain/                    ← 型定義 + SportID enum
    math/                      ← EWMA, ACWR, Z-Score, sigmoid, decay, Wilson
    pipeline/                  ← 6ノード + 品質ゲート + 傾向検出
    config/                    ← YAML設定 + SportProfile（5競技）
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
  出力: { status: "ok", version: "v6.2-go", memory_mb }
```

### ロールアウト計画

```
Shadow Mode（1週間）→ カナリア10%（1週間）→ 50% → 100%
自動ロールバック: エラー率>5% or レイテンシp99>3秒
TypeScript版は6ヶ月間フォールバックとして維持
```
