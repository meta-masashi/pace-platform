# PACE Platform マスター仕様書
## Performance Analytics & Conditioning Engine

**バージョン**: v6.0
**最終更新**: 2026-04-01
**対象競技**: サッカー（Football）
**URL**: https://hachi-riskon.com

---

## 目次

1. [プロダクト概要](#1-プロダクト概要)
2. [技術スタック](#2-技術スタック)
3. [システム構成図](#3-システム構成図)
4. [ユーザーと権限](#4-ユーザーと権限)
5. [画面一覧](#5-画面一覧)
6. [推論エンジン（v6パイプライン）](#6-推論エンジンv6パイプライン)
7. [データベース設計](#7-データベース設計)
8. [API 一覧](#8-api-一覧)
9. [認証・セキュリティ](#9-認証セキュリティ)
10. [外部サービス連携](#10-外部サービス連携)
11. [環境変数](#11-環境変数)

---

## 1. プロダクト概要

### PACEとは

PACEは、サッカーチームのアスレティックトレーナー（AT）やコーチが、選手のコンディションを科学的に管理するためのWebアプリケーションです。

選手が毎日入力する「体の調子」データをもとに、AIが「今日トレーニングしても大丈夫か」を4色（緑・黄・橙・赤）で判定します。

### 誰が使うか

| ユーザー | 使うデバイス | 何をするか |
|---------|------------|-----------|
| **選手（アスリート）** | スマートフォン | 毎日の体調入力（チェックイン）、自分のコンディション確認 |
| **AT / PT / S&Cコーチ** | タブレット・PC | 選手一覧の確認、トリアージ（優先対応）、SOAP記録、リハビリ管理 |
| **マスター管理者** | PC | 組織・チーム・スタッフ・請求の管理 |

### 4色の判定（信号機モデル）

| 色 | 意味 | 選手への表示 | ATへの表示 |
|---|------|------------|-----------|
| 🟢 **GREEN** | 通常トレーニングOK | 「コンディション良好」 | P5: 正常適応 |
| 🟡 **YELLOW** | 注意が必要 | 「やや疲労あり」 | P3/P4: 慢性不適応 or GAS疲憊 |
| 🟠 **ORANGE** | 強度制限を推奨 | 「負荷を下げましょう」 | P2: 力学的リスク |
| 🔴 **RED** | トレーニング中止 | 「休養してください」 | P1: 安全性 |

---

## 2. 技術スタック

### フロントエンド（ユーザーが操作する画面）

| 技術 | 役割 | 簡単な説明 |
|------|------|-----------|
| **Next.js 15** | Webフレームワーク | Reactベースの画面描画 + サーバー処理を1つのプロジェクトで管理 |
| **React 19** | UI構築 | ボタン、フォーム、グラフなどの画面部品を作る |
| **Tailwind CSS 3** | デザイン | `bg-red-500` のようなクラスで色やサイズを指定するCSSツール |
| **Recharts** | グラフ描画 | ACWR推移やコンディショントレンドの折れ線グラフ |
| **Framer Motion** | アニメーション | 画面遷移やスワイプ操作の滑らかな動き |
| **React Query v5** | データ取得キャッシュ | APIから取得したデータを30秒間記憶し、画面遷移時の再読み込みを防止 |
| **Zustand** | 状態管理 | アプリ全体で共有するデータ（ログイン情報など）の管理 |

### バックエンド（裏側の処理）

| 技術 | 役割 | 簡単な説明 |
|------|------|-----------|
| **Supabase** | データベース + 認証 | PostgreSQLデータベース + ログイン機能をクラウドで提供 |
| **Supabase Edge Functions** | サーバーレス関数 | 定期実行やバックグラウンド処理 |
| **Vercel** | ホスティング | Next.jsアプリをインターネットに公開するサービス |
| **GitHub Actions** | CI/CD | コード変更時に自動テスト・自動デプロイ |

### AI / 外部サービス

| 技術 | 役割 | 簡単な説明 |
|------|------|-----------|
| **Google Gemini** | AI生成 | SOAP記録のAI補完、コンディションインサイト生成 |
| **Stripe** | 決済 | 月額サブスクリプション課金 |
| **Google Calendar** | スケジュール連携 | 試合日・練習日の自動取得 |

---

## 3. システム構成図

```
┌─────────────────────────────────────────────────────┐
│  ユーザー（ブラウザ / スマホ）                          │
│                                                     │
│  選手 → /home, /checkin     スタッフ → /dashboard    │
└──────────────┬──────────────────────┬────────────────┘
               │                      │
               ▼                      ▼
┌──────────────────────────────────────────────────────┐
│  Next.js アプリケーション（Vercel にデプロイ）          │
│                                                      │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │ 画面    │  │ API      │  │ 推論エンジン v6   │   │
│  │ (React) │→ │ (/api/*) │→ │ (6層パイプライン) │   │
│  └─────────┘  └──────────┘  └───────────────────┘   │
└──────────────┬──────────────────────┬────────────────┘
               │                      │
               ▼                      ▼
┌──────────────────────┐  ┌───────────────────────────┐
│  Supabase            │  │  外部サービス              │
│  ├ PostgreSQL (DB)   │  │  ├ Gemini AI              │
│  ├ Auth (認証)       │  │  ├ Stripe (決済)          │
│  ├ RLS (行レベル制御)│  │  ├ Google Calendar        │
│  └ Edge Functions    │  │  └ Slack (通知)           │
└──────────────────────┘  └───────────────────────────┘
```

---

## 4. ユーザーと権限

### ロール一覧

| ロール | 説明 | できること |
|--------|------|-----------|
| **master** | マスター管理者 | 全機能 + スタッフ管理 + チーム管理 + 請求管理 |
| **AT** | アスレティックトレーナー | 全選手の閲覧・評価・SOAP・リハビリ・ロック操作 |
| **PT** | 理学療法士 | 同上（ATと同権限） |
| **S&C** | S&Cコーチ | 同上（ATと同権限） |
| **athlete** | 選手 | 自分のデータの閲覧・チェックイン入力のみ |

### データアクセス制御

```
組織 (Organization)
  └── チーム (Team)
       ├── スタッフ: 同じ組織の全選手データにアクセス可能
       └── 選手: 自分のデータのみ
```

Supabase の **RLS（Row Level Security）** により、データベースレベルでアクセス制御を実施。`get_my_org_id()` 関数でログインユーザーの組織IDを自動判定。

---

## 5. 画面一覧

### スタッフ画面（PC / タブレット）

左サイドバーに **4つのアクションハブ** + ユーティリティ：

| ハブ | URL | 含まれる機能 |
|------|-----|------------|
| **チーム** | `/dashboard` | チームコンディション一覧、トリアージ、AI Copilot |
| **選手** | `/athletes` | 選手詳細ダッシュボード、アセスメント、リハビリ、SOAP |
| **計画** | `/training` | トレーニングメニュー生成・承認、What-Ifシミュレーション |
| **Analytics** | `/reports` | チーム・個人レポート生成 |
| コミュニティ | `/community` | チーム内チャット |
| 設定 | `/settings` | プロフィール、通知、連携設定 |
| 管理（masterのみ） | `/admin` | スタッフ管理、チーム管理、請求管理 |

#### 選手詳細ダッシュボード（ラプソード型）

`/athletes/[athleteId]` は1画面スクロール型：

```
┌─ ヘッダー: 戻るボタン + What-If + アセスメント + SOAP作成 ─┐
│                                                          │
│  セクション1: ロック状態 + コンディションリング + AI分析    │
│  ┌──────────────────────────────────────────────┐        │
│  │  コンディションスコア: 78/100 [リング表示]    │        │
│  │  AI: 「コンディション良好。通常メニュー可能」  │        │
│  └──────────────────────────────────────────────┘        │
│                                                          │
│  セクション2: パフォーマンス指標（MetricLabel）            │
│  ┌──────────┐┌──────────┐┌──────────┐┌──────────┐       │
│  │Readiness ││ ACWR     ││ Fitness  ││ Fatigue  │       │
│  │  78.0    ││  1.12    ││  65.3    ││  42.1    │       │
│  │ [良好]   ││ [最適]   ││ [標準]   ││ [普通]   │       │
│  └──────────┘└──────────┘└──────────┘└──────────┘       │
│                                                          │
│  セクション3: 日別メトリクス推移テーブル                   │
│                                                          │
│  セクション4: SOAPノート一覧                              │
└──────────────────────────────────────────────────────────┘
```

### 選手画面（モバイル / PWA）

下部タブナビゲーション（5タブ）：

| タブ | URL | 画面内容 |
|------|-----|---------|
| **ホーム** | `/home` | GlowingCore（状態サークル）、AIサマリ、MetricLabel、PerformanceCompass |
| **入力** | `/checkin` | Bio-Swipeチェックイン（身体図スワイプ）→ スライダーフォーム |
| **履歴** | `/history` | トレンドチャート + 30日カレンダーヒートマップ |
| **スキャン** | `/scanner` | カメラ解析（スマートスキャナー） |
| **マイ** | `/profile` | プロフィール情報、データ蓄積状況、ログアウト |

#### チェックイン入力フロー

```
Step 1: Bio-Swipe（身体図でYES/NO）
  └─ スキップ可能 →
Step 2: スライダーフォーム
  ├ RPE（主観的運動強度）: 0-10
  ├ トレーニング時間: 分
  ├ 睡眠の質: 0-10
  ├ 主観的体調: 0-10
  ├ 疲労感: 0-10        ← 質問順序は毎日ランダム
  ├ 痛み NRS: 0-10      ← 常に最後（他に影響を与えないため）
  ├ HRV: bpm（任意）
  ├ 月経周期フェーズ: （女性のみ、任意）
  ├ NSAID服用: チェックボックス
  ├ 痛みの原因: NRS≥4の場合のみ（外傷性/障害性）
  ├ セッション番号: 2回目以降の練習の場合
  └ キャリブレーション: 3ヶ月ごとに表示
```

### 指標の二層表現（MetricLabel）

同じ数値を、選手とスタッフで異なる形で表示します：

| 指標 | 選手向け表示 | スタッフ向け表示 |
|------|-----------|---------------|
| ACWR 1.12 | 「負荷バランス: 最適」🟢 | ACWR: 1.12 [最適] |
| Readiness 78 | 「コンディション: 78/100 良好」🟢 | Readiness: 78.0 [良好] |
| Fitness 65 | 「体力の蓄積: 65 標準」🟡 | Fitness EWMA: 65.0 [標準] |
| Fatigue 42 | 「回復度: 58%」🟢 | Fatigue EWMA: 42.0 [普通] |
| NRS 6 | 「痛みの強さ: 6/10」😟 | Pain NRS: 6/10 [やや強い] |

---

## 6. 推論エンジン（v6パイプライン）

### 概要

選手が入力したデータは、**6層のパイプライン**を通って最終的な判定（RED/ORANGE/YELLOW/GREEN）に変換されます。

```
入力データ → Node0 → Node1 → Node2 → Node3 → Node4 → Node5 → 判定表示
              取得    洗浄    特徴量   推論    判定    表示
```

### 各ノードの役割

#### Node 0: データ取得（Ingestion）

選手の基本情報をデータベースから取得します。

```
取得するもの:
  - 選手ID、年齢、競技、コンタクトスポーツか
  - 過去の怪我の履歴（既往歴）
  - データ蓄積日数（何日分チェックインしたか）
```

#### Node 1: データクリーニング（Cleaning）

入力データの品質をチェックし、異常値を修正します。

```
処理:
  1. 外れ値検出: 生理学的にありえない値を検出
     例: 心拍数 300bpm → 外れ値として修正
  2. 欠損値補完:
     - gap ≤ 14日: LOCF（前回の値をそのまま使う）+ 指数減衰
     - gap > 14日: 中立デフォルト値を使用
  3. データ品質スコア: 0.0〜1.0 で品質を数値化
  4. 成熟モード判定:
     - 0-13日: セーフティモード（限定的な判定）
     - 14-27日: ラーニングモード（Z-Score有効化）
     - 28日〜: フルモード（全機能解放）
```

#### Node 2: 特徴量エンジニアリング（Feature Engineering）

入力データから判定に必要な「指標」を計算します。

```
計算する指標:
  1. EWMA-ACWR（急性:慢性負荷比）
     - 急性負荷: 直近7日のEWMA（λ=0.25）
     - 慢性負荷: 直近28日のEWMA（λ=0.07）
     - ACWR = 急性 / 慢性
     - 安全域: 0.8〜1.3（Sweet Spot）

  2. 単調性指標（Monotony Index）
     - 直近7日の負荷の平均 / 標準偏差
     - 同じ負荷が続くと高くなる

  3. Z-Score（個人ベースライン比較）
     - 各主観指標の28日平均と標準偏差を計算
     - 今日の値が平均からどれだけ離れているかを数値化
     - Z = (今日の値 - 28日平均) / 28日標準偏差

  4. 複合 Readiness スコア
     - ACWR Sweet Spot スコア × 40%
     - ウェルネスZ平均スコア × 40%
     - ベースライン × 20%
```

**エビデンス**: EWMA-ACWRはQin et al. (2025) の22研究メタアナリシス（Level 2a）で支持。

#### Node 3: 推論（Inference）

特徴量から身体部位別のリスクスコアを計算します。

```
計算:
  1. 身体部位別リスクスコア（ロジスティック関数）
     - 膝、足首、腰、ハムストリングなど9部位
     - 各部位: risk = sigmoid(重み付き特徴量の合計)

  2. MRF（マルコフ確率場）リスク伝播
     - 隣接する身体部位にリスクが伝播
     - 例: 足首のリスク上昇 → 膝にも0.7の係数で伝播

  3. ベイズ事後確率
     - 既往歴（事前確率）× リスクスコア（尤度）= 事後確率

  4. 尺度インフレ検知
     - Z-Scoreの標準偏差が0.5未満 → 「同じ値を繰り返し入力している」警告
```

**特徴量の重み（Level 2以上のエビデンスのみ）**:

| 変数 | 重み | エビデンス |
|------|------|-----------|
| ACWR超過分 | 2.5 | Qin (2025) メタアナリシス Level 2a |
| ウェルネス悪化度 | 2.0 | Saw (2016) SR Level 2a |
| 傷害歴リスク | 1.5 | Esmaeili (2018) Level 2b |
| 単調性（補助） | 0.3 | Level 2a 否定的（低重み） |

#### Node 4: 判定（Decision）

リスクスコアと特徴量から、最終的な4色判定を行います。

```
判定の優先順位（P1が最優先、P5が最低）:

P1: 安全性（RED — トレーニング中止）
  条件:
  ├ 痛み NRS ≥ 8（ただしNSAID服用中はスキップ）
  ├ 安静時心拍数 Z-Score > 2.0（順化期間中はスキップ）
  ├ 発熱後7日以内
  ├ ワクチン接種後7日以内
  └ 睡眠の質 ≤ 2 かつ 疲労度 ≥ 8（複合ルール）

P2: 力学的リスク（ORANGE — 強度制限）
  条件（複合条件 — 両方を満たす場合のみ）:
  ├ ACWR > 1.5（13-17歳は1.3に引き下げ）
  └ ウェルネス Z ≤ -1.0 が 2項目以上
  ※ ACWR高値のみの場合はORANGE（注意喚起）

P3: 慢性的不適応（YELLOW — 調整推奨）
  条件:
  ├ ACWR は正常域（0.8〜1.3）だが
  └ ウェルネス Z ≤ -1.5 が 3項目以上

P4: GAS疲憊期（YELLOW — リカバリー推奨）
  条件:
  ├ Z-Score ≤ -1.5 が 2項目以上
  └ ACWR / Monotony は正常範囲

P4b: アロスタティック負荷（YELLOW）
  条件:
  ├ sRPE < 4（低い練習負荷）
  ├ 睡眠 Z ≤ -1.5
  └ 疲労 Z ≥ 1.5

P5: 正常適応（GREEN — 通常トレーニング継続）
  条件: 上記に該当しない

コンテキスト・オーバーライド:
  - 試合日: P4の閾値を緩和
  - 順化期間: 心拍P1をミュート、P4を緩和
  - 減量期: P4の疲労警告を抑制
  - コンタクトスポーツ × 外傷性痛み: Pain P1閾値を緩和
```

#### Node 5: 表示（Presentation）

判定結果を人間が読める形に変換します。

```
出力:
  1. 判定色（RED/ORANGE/YELLOW/GREEN）
  2. 判定理由（日本語 + 英語）
  3. 推奨アクション（休養/強度制限/監視/継続）
  4. FIFA 11+ プログラム推奨
     - GREEN: FIFA 11+をウォーミングアップに推奨
     - YELLOW: Level 2 バランストレーニング重点
     - ORANGE: Level 1 基礎に限定
     - RED: 練習見送り、復帰時Level 1から段階的に
  5. 推論トレースログ（監査証跡としてDB保存）
  6. 法的免責条項の付与
```

### エビデンスの方針

PACEは **Oxford CEBM Level 2 以上** のエビデンスのみを判定ロジックに採用しています。

**排除したもの**:
- ODE損傷エンジン（Level 5: 動物実験のみ）
- EKFデカップリング（学術論文ゼロ）
- Banister FFM（Level 2b で統計的欠陥が証明）
- Monotony 単独トリガー（Level 2a で否定的結果）
- 構造的脆弱性テンソル（Level 5: FEMベース）

---

## 7. データベース設計

### 主要テーブル一覧

#### 組織・ユーザー系

| テーブル | 説明 | 主なカラム |
|---------|------|-----------|
| `organizations` | 組織（スポーツクラブ） | id, name, plan, athlete_limit |
| `teams` | チーム | id, org_id, name |
| `staff` | スタッフ | id, org_id, name, email, role |
| `athletes` | 選手 | id, org_id, team_id, name, user_id, position, number, age, sex |

#### 日次データ系

| テーブル | 説明 | 主なカラム |
|---------|------|-----------|
| `daily_metrics` | 日次チェックインデータ | athlete_id, date, nrs, rpe, sleep_score, fatigue_subjective, acwr, medication_nsaid_24h, menstrual_phase, pain_type |
| `session_logs` | セッション別記録 | athlete_id, session_date, session_number, srpe, session_load |
| `coaching_history` | AIコーチング履歴 | athlete_id, coaching_date, advice_text, context_snapshot |
| `gps_session_loads` | GPS外部負荷データ | athlete_id, session_date, total_distance_km, high_speed_running_m, sprint_distance_m |

#### 評価・リハビリ系

| テーブル | 説明 | 主なカラム |
|---------|------|-----------|
| `assessments` | アセスメント | athlete_id, assessment_type, status, primary_diagnosis |
| `assessment_nodes` | CAT質問ツリー | node_id, file_type, lr_yes, lr_no, routing_rules |
| `rehab_programs` | リハビリプログラム | athlete_id, diagnosis_code, current_phase, status |
| `rehab_phase_gates` | フェーズ進行条件 | program_id, phase, gate_criteria, gate_met_at |
| `soap_notes` | SOAP記録 | athlete_id, staff_id, s_text, o_text, a_text, p_text, ai_assisted |
| `athlete_locks` | 活動制限 | athlete_id, lock_type (hard/soft), tag, expires_at |

#### 推論・監査系

| テーブル | 説明 | 主なカラム |
|---------|------|-----------|
| `inference_trace_logs` | 推論実行ログ | athlete_id, inference_snapshot, decision, priority |
| `athlete_condition_cache` | コンディションキャッシュ | athlete_id, fitness_score, fatigue_score, readiness_score, baseline_reset_at |

#### 課金・請求系

| テーブル | 説明 | 主なカラム |
|---------|------|-----------|
| `subscriptions` | サブスクリプション | org_id, stripe_customer_id, plan, status |
| `stripe_events` | Webhook冪等性 | stripe_event_id, event_type, processed_at |
| `dunning_schedules` | 支払い失敗回復 | org_id, dunning_day |

### RLS（行レベルセキュリティ）

全テーブルでRLSが有効化されており、以下のルールが適用されます：

```
スタッフ: org_id = get_my_org_id() のデータのみアクセス可能
選手: user_id = auth.uid() の自分のデータのみアクセス可能
マスター: is_master() で追加の管理操作が可能
```

---

## 8. API 一覧

### チェックイン・コンディション

| メソッド | URL | 説明 |
|---------|-----|------|
| POST | `/api/checkin` | 日次チェックインデータの送信 |
| GET | `/api/conditioning/{athleteId}` | 選手のコンディションスコア取得 |
| GET | `/api/athlete/home-data/{athleteId}` | 選手ホーム画面の統合データ |

### 推論パイプライン

| メソッド | URL | 説明 |
|---------|-----|------|
| POST | `/api/pipeline` | v6推論パイプライン実行 |
| POST | `/api/pipeline/team-anomaly` | チーム全体異常検知 |
| POST | `/api/pipeline/baseline-reset` | ベースラインリセット |
| GET | `/api/pipeline/trace/{traceId}` | 推論トレースログ取得 |

### アセスメント

| メソッド | URL | 説明 |
|---------|-----|------|
| POST | `/api/assessment/start` | アセスメント開始 |
| POST | `/api/assessment/answer` | 質問への回答送信 |
| POST | `/api/assessment/next-questions` | 次の質問取得（CAT） |

### SOAP / ドキュメント

| メソッド | URL | 説明 |
|---------|-----|------|
| GET/POST | `/api/soap` | SOAPノートのCRUD |
| POST | `/api/soap/generate` | AIによるSOAPセクション生成 |

### トレーニング・リハビリ

| メソッド | URL | 説明 |
|---------|-----|------|
| POST | `/api/training/generate` | AIトレーニングメニュー生成 |
| GET/POST | `/api/rehab/programs` | リハビリプログラム管理 |
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
| GET/POST | `/api/admin/staff` | スタッフ管理（masterのみ） |
| GET/POST | `/api/admin/teams` | チーム管理（masterのみ） |
| GET/POST | `/api/locks` | 活動制限ロック管理 |

---

## 9. 認証・セキュリティ

### 認証フロー

```
1. ユーザーが /login にアクセス
2. メール/パスワード or Google OAuth or Magic Link でログイン
3. Supabase Auth がセッションCookieを発行
4. Middleware が全リクエストでCookieを検証・リフレッシュ
5. ロール判定:
   - athletes.user_id にマッチ → /home（選手画面）
   - staff テーブルにレコードあり → /dashboard（スタッフ画面）
```

### セキュリティ対策

| 対策 | 実装状況 | 説明 |
|------|---------|------|
| **CSP** | ✅ | Content-Security-Policy ヘッダーで外部スクリプト制限 |
| **HSTS** | ✅ | HTTPS強制（max-age=63072000） |
| **X-Frame-Options** | ✅ | DENY（クリックジャッキング防止） |
| **RLS** | ✅ | 全テーブルで行レベルセキュリティ |
| **入力バリデーション** | ✅ | UUID検証、文字列サニタイズ、日付検証 |
| **レートリミット** | ✅ | Gemini API: 20req/min、S2S: 100req/hour |
| **XSS防止** | ✅ | dangerouslySetInnerHTML 未使用、React自動エスケープ |
| **認証ガード** | ✅ | 全APIルートでセッション検証 |

---

## 10. 外部サービス連携

| サービス | 用途 | 認証方式 |
|---------|------|---------|
| **Supabase** | DB + 認証 + ストレージ | Service Role Key / Anon Key |
| **Google Gemini** | AI テキスト生成 + ベクトル埋め込み | API Key |
| **Stripe** | サブスクリプション課金 | Secret Key + Webhook Secret |
| **Google Calendar** | スケジュール同期 | OAuth 2.0 |
| **Slack** | アラート通知 | Incoming Webhook |
| **AWS S3** | 動画ストレージ | SDK + Presigned URL |
| **Sentry** | エラー監視 | DSN Token |

---

## 11. 環境変数

### 必須（デプロイに必要）

| 変数名 | 説明 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクトURL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 公開キー |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase サービスロールキー（バックエンドのみ） |
| `SUPABASE_PROJECT_REF` | Supabase プロジェクト参照ID（20文字） |
| `SUPABASE_ACCESS_TOKEN` | Supabase Management API トークン |
| `GEMINI_API_KEY` | Google Gemini API キー |
| `STRIPE_SECRET_KEY` | Stripe シークレットキー |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook 署名シークレット |

### 任意（機能拡張用）

| 変数名 | 説明 |
|--------|------|
| `NEXT_PUBLIC_SITE_URL` | 本番URL（デフォルト: https://hachi-riskon.com） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Calendar OAuth |
| `SLACK_WEBHOOK_URL` | Slack通知 |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry エラー監視 |
| `NEXT_PUBLIC_GTM_ID` | Google Tag Manager |

---

## 付録

### ファイル構成（主要ディレクトリ）

```
pace-platform/
├── app/
│   ├── (staff)/          # スタッフ画面（サイドバー + ヘッダー）
│   │   ├── dashboard/    # チームダッシュボード
│   │   ├── athletes/     # 選手管理
│   │   ├── assessment/   # アセスメント
│   │   ├── rehab/        # リハビリ
│   │   ├── soap/         # SOAP記録
│   │   ├── training/     # トレーニング
│   │   ├── what-if/      # シミュレーション
│   │   ├── triage/       # トリアージ
│   │   ├── community/    # コミュニティ
│   │   ├── reports/      # レポート
│   │   ├── settings/     # 設定
│   │   └── admin/        # 管理（masterのみ）
│   ├── (athlete)/        # 選手画面（モバイル + 下部タブ）
│   │   ├── home/         # ホーム
│   │   ├── checkin/      # チェックイン
│   │   ├── history/      # 履歴
│   │   ├── scanner/      # スキャナー
│   │   └── profile/      # プロフィール
│   ├── api/              # APIルート（60+エンドポイント）
│   ├── login/            # ログイン画面
│   ├── _components/      # 共通コンポーネント
│   └── _providers/       # React Query プロバイダー
├── lib/
│   ├── engine/v6/        # 推論エンジン
│   │   ├── nodes/        # Node 0-5
│   │   ├── types.ts      # 型定義
│   │   ├── config.ts     # 設定値
│   │   ├── pipeline.ts   # パイプライン統合
│   │   └── gateway.ts    # 外部サービス接続
│   ├── assessment/       # CATアセスメントエンジン
│   ├── billing/          # Stripe課金
│   ├── calendar/         # Google Calendar
│   ├── conditioning/     # コンディショニングスコア
│   ├── decay/            # リスク減衰計算
│   ├── gemini/           # Gemini AI
│   ├── security/         # バリデーション・サニタイズ
│   └── supabase/         # DB接続（client.ts / server.ts）
├── hooks/                # React Queryカスタムフック
├── middleware.ts          # 認証ミドルウェア
└── public/               # 静的ファイル（PWA manifest等）

supabase/
└── migrations/           # DBマイグレーション（55ファイル）
```

### 料金プラン

| プラン | 月額 | 選手上限 | 機能 |
|--------|------|---------|------|
| Standard | ¥100,000 | 30名 | 基本機能 |
| Pro | ¥300,000 | 100名 | AI分析 + GPS連携 |
| Pro + CV | ¥500,000 | 100名 | コンピュータビジョン解析 |
| Enterprise | 要問合せ | 無制限 | 全機能 + カスタマイズ |
