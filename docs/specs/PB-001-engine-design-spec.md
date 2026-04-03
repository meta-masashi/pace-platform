# PB-001: 確定的コンディション・スコア設計仕様書

**バージョン:** 1.0
**作成日:** 2026-04-02
**ステータス:** ドラフト（レビュー待ち）
**準拠:** PACE v6.1 マスタープラン Phase 3 / 絶対原則 A1-A3
**関連ADR:** ADR-020（EWMA）, ADR-021（ACWR Zones）, ADR-025（Readiness正規化）

---

## 1. 概要

本仕様書は Sprint 1 P0 タスク PB-001（確定的コンディション・スコア設計）の全サブタスクをカバーする。

**絶対原則の遵守:**

| # | 原則 | 本仕様での遵守 |
|---|------|--------------|
| A1 | エビデンス基準 Oxford CEBM Level 2+ | Banister (1975) Fitness-Fatigue Model, Gabbett (2016) ACWR, Foster (2001) sRPE |
| A2 | 100%確定的判定: LLM不使用 | Node 0-4 に LLM は一切介在しない。全計算は確定的アルゴリズム |
| A3 | 専門家委譲: qualityScore < 0.6 → 判定しない | Node 1 で品質ゲート適用。不良時は YELLOW + 専門家確認推奨 |

---

## 2. PB-001-1: ハイブリッド・ピーキング計算仕様

### 2.1 Fitness-Fatigue Model（Banister 1975 ベース）

既存実装: `lib/conditioning/ewma.ts` + `pace-inference/internal/math/ewma.go`

#### EWMA パラメータ

| 指標 | スパン | 平滑化係数 α | 根拠 |
|------|--------|-------------|------|
| Fitness | 42日 | 2/(42+1) ≈ 0.0465 | Banister (1975): 長期適応の時定数 τ₁ = 42日 |
| Fatigue | 7日 | 2/(7+1) = 0.25 | Banister (1975): 短期疲労の時定数 τ₂ = 7日 |

#### 計算式

```
α = 2 / (span + 1)
S_t = α × x_t + (1 - α) × S_{t-1}
S_0 = x_0（初期値は最初のデータポイント）
```

**入力値 x_t:** `daily_metrics.srpe`（Session RPE: 0-100）

NaN/Infinity はスキップし、直前の EWMA 値を維持する。

### 2.2 Readiness スコア正規化

既存実装: ADR-025 で承認済み

```
readiness_raw = 50 + (fitness - fatigue)
readiness     = clamp(readiness_raw × (1 - subjective_penalty), 0, 100)
```

#### 主観ペナルティ係数（朝の主観申告による Fatigue 増幅）

```typescript
let penalty = 0;
if (sleepQuality !== null && sleepQuality < 3) {
  penalty += (3 - sleepQuality) * 0.03;   // 最大 0.06（6%減）
}
if (fatigueFeeling !== null && fatigueFeeling < 3) {
  penalty += (3 - fatigueFeeling) * 0.02; // 最大 0.04（4%減）
}
subjectivePenalty = Math.min(penalty, 0.10); // 上限 10%
```

### 2.3 Pro Mode: HRV ペナルティ（Level 2 デバイス連携）

Pro 以上のプランで HRV デバイス（Garmin, Oura, Whoop 等）が連携されている場合:

```
if hrv_baseline_delta < -0.15:  // ベースラインから 15% 以上低下
    hrv_penalty = abs(hrv_baseline_delta) × 0.3  // 最大約 0.3（30%減）
    subjectivePenalty = min(subjectivePenalty + hrv_penalty, 0.30)
```

| HRV Δ baseline | 追加ペナルティ | 最終スコアへの影響 |
|----------------|--------------|------------------|
| -0.15 (15%低下) | +0.045 | 約 4.5% 減 |
| -0.20 (20%低下) | +0.060 | 約 6.0% 減 |
| -0.30 (30%低下) | +0.090 | 約 9.0% 減 |

**プランゲーティング:** `feature_condition_score_hrv` — Pro 以上

### 2.4 ステータス閾値

| ステータス | Readiness | 意味 | 色 | ダッシュボード |
|-----------|-----------|------|-----|-------------|
| `critical` | < 40 | 練習参加制限検討 | Red | Critical KPI カウント |
| `watchlist` | 40-59 | 注意観察 | Amber | Watchlist KPI カウント |
| `normal` | 60-79 | 通常参加可能 | Slate | — |
| `zone` | ≥ 80 | 絶好調・積極起用 | Emerald | Availability KPI カウント |

---

## 3. PB-001-2: P1-P5 判定との統合仕様

### 3.1 独立性の原則

**Readiness スコアと P1-P5 判定は独立したシステムであり、混合しない。**

| システム | 目的 | 出力 | 決定性 |
|---------|------|------|--------|
| Readiness スコア | UI 表示用の連続値 | 0-100 数値 + ステータス色 | 確定的（EWMA + 主観ペナルティ） |
| P1-P5 判定 | 臨床的リスク分類 | RED/ORANGE/YELLOW/GREEN + 推奨アクション | 確定的（優先階層カスケード） |

### 3.2 統合ルール

```
最終表示 = P1-P5 判定色  (P1-P4 がトリガーされた場合)
         | Readiness ステータス色  (P5: 正常の場合)
```

- P1-P4 がトリガーされた場合: **判定色が Readiness ステータス色を上書き**する
- P5（正常）の場合: Readiness ステータス色がそのまま表示される
- Readiness スコアの数値自体は常に表示（P1-P4 時も参考値として）

### 3.3 P1-P5 優先階層（既存実装の確認）

既存実装: `lib/engine/v6/nodes/node4-decision.ts`

| 優先度 | 条件 | 判定色 | 推奨アクション |
|--------|------|--------|-------------|
| **P1: 絶対的禁忌** | Pain NRS ≥ 8, HR spike > Z=2.0, 発熱/ワクチン後7日 | RED | rest, medical_review |
| **P2: 力学的崩壊** | ACWR > 1.5 + wellness Z ≤ -1.0 → RED / ACWR > 1.5 only → ORANGE | RED/ORANGE | reduce_intensity(30-50%), modify_menu |
| **P3: デカップリング** | ACWR正常 + severe decline ≥ 3 (Z ≤ -1.5) | YELLOW | monitor, modify_menu |
| **P4: GAS疲憊期** | 複数主観 Z ≤ -1.5, ACWR/Monotony正常 | YELLOW | reduce_intensity(recovery), monitor |
| **P5: 正常適応** | 上記いずれも非該当 | GREEN | continue |

### 3.4 コンテキスト・オーバーライド

| コンテキスト | 影響 | 根拠 |
|------------|------|------|
| 試合日 (isGameDay) | P4 閾値 +1（寛容化） | 試合前の緊張による一時的な主観低下を考慮 |
| 順化期間 (isAcclimatizing) | Z-Score 閾値 -0.5 | 環境適応中は通常範囲でも注意 |
| 減量中 (isWeightMaking) | P4 カウント +1 | 減量ストレスを加算 |
| PHV期 (13-17歳) | ACWR閾値 × 0.867 | 成長期の脆弱性考慮 |

---

## 4. PB-001-3: LLM 責務分離設計

**→ 別ファイル: `docs/adr/ADR-029-llm-responsibility-separation.md`**

### 4.1 LLM 責務の厳格限定

| 許可（Node 5 以降のみ） | 禁止（Node 0-4） |
|------------------------|------------------|
| InsightCard テキスト生成（NLG） | コンディション判定 |
| SOAP ノート文章化 | リスク分類 (P1-P5) |
| デイリーコーチ・アドバイス | スコア算出 |
| トレーニング計画生成 | 閾値設定 |
| Calendar イベント分類（Function Calling） | データ品質判定 |

### 4.2 LLM ダウン時のフォールバック

| 機能 | フォールバック動作 | 影響 |
|------|------------------|------|
| InsightCard | テンプレートテキスト表示（Readiness スコア + P1-P5 判定を埋め込み） | UX 劣化のみ、判定は不変 |
| SOAP ノート | 構造化データのみ表示（NLG なし） | 文章は生成されないが、データは閲覧可能 |
| デイリーコーチ | 汎用アドバイステンプレート | パーソナライズ低下 |
| トレーニング計画 | 生成不可エラー表示 + 手動作成を促す | スタッフが手動で計画 |

---

## 5. PB-001-4: daily_metrics テーブル拡張 + plan-gates 拡張

### 5.1 既存スキーマ確認

`daily_metrics` テーブル（既存カラム）:
- id, athlete_id, org_id, date, nrs, hrv, acwr, sleep_score, subjective_condition, hp_computed, source
- 拡張済み: srpe, sleep_quality, fatigue_feeling

`athlete_condition_cache` テーブル（既存カラム）:
- athlete_id, date, fitness_score, fatigue_score, readiness_score, acwr, acwr_acute, acwr_chronic
- level, hrv_baseline_delta, subjective_penalty

### 5.2 追加不要の確認

**結論: daily_metrics のスキーマ拡張は不要。**

理由:
- Fitness/Fatigue/Readiness は `athlete_condition_cache` に既に保存されている
- daily_metrics は生の入力データ（sRPE, 主観スコア等）を保持する役割
- 計算結果はキャッシュテーブルに分離する設計が ADR-022 で承認済み

### 5.3 plan-gates 拡張

既存フラグ: `basic_assessment`, `daily_checkin`, `rag_pipeline`, `gemini_ai`, `cv_analysis`, `custom_bayes`, `multi_team`

**追加フラグ:**

```typescript
// plan-gates.ts に追加するフラグ
| 'feature_condition_score'        // P1-P5 + Readiness（全プラン）
| 'feature_condition_score_hrv'    // HRV ペナルティ付き Readiness（Pro以上）
| 'feature_insight_card'           // Gemini InsightCard（Pro以上）
| 'feature_calendar_sync'          // Google Calendar Function Calling（Pro以上）
| 'feature_ai_weekly_plan'         // AI 週次計画 + トークン上限管理（Pro以上）
| 'feature_risk_avoidance_report'  // ファクトベースROIレポート（Pro以上）
| 'feature_acwr_trend_chart'       // ACWR トレンドチャート（Pro以上）
```

**プラン別マッピング:**

| フラグ | Standard | Pro | Pro+CV | Enterprise |
|--------|----------|-----|--------|------------|
| feature_condition_score | o | o | o | o |
| feature_condition_score_hrv | - | o | o | o |
| feature_insight_card | - | o | o | o |
| feature_calendar_sync | - | o | o | o |
| feature_ai_weekly_plan | - | o | o | o |
| feature_risk_avoidance_report | - | o | o | o |
| feature_acwr_trend_chart | - | o | o | o |

---

## 6. PB-001-5: 段階的 Z-Score + 傾向通知

### 6.1 段階的 Z-Score ウェイト（14日の崖解消）

新規登録直後はデータが不足し、Z-Score が不安定になる。
急激な閾値変化（「14日の崖」）を防ぐため、段階的ウェイトを適用する。

| データ蓄積日数 | Z-Score ウェイト | 説明 |
|-------------|----------------|------|
| 0-13日 | 0% | Z-Score 不使用（データ不足） |
| 14-21日 | 50% | 半分の影響力で適用開始 |
| 22-27日 | 75% | 3/4 の影響力 |
| 28日以上 | 100% | フル適用 |

**適用箇所:**
- P2 判定の wellness Z ≤ -1.0 チェック
- P3 判定の severe decline Z ≤ -1.5 チェック
- P4 判定の複数主観 Z ≤ -1.5 チェック

```typescript
function getZScoreWeight(dataPointCount: number): number {
  if (dataPointCount < 14) return 0;
  if (dataPointCount < 22) return 0.5;
  if (dataPointCount < 28) return 0.75;
  return 1.0;
}

// Z-Score に重み適用
const effectiveZ = rawZ * getZScoreWeight(dataPointCount);
```

### 6.2 傾向通知（Trend Notices）

**判定色を変更しない。** `trend_notices` 配列に追加のみ。

| 傾向パターン | 通知内容 | 条件 |
|------------|---------|------|
| 3日連続 Readiness 低下 | "コンディションが3日連続で低下しています" | readiness[t] < readiness[t-1] < readiness[t-2] |
| ACWR 急上昇 | "負荷バランスが急速に上昇しています" | ACWR Δ1week > +0.3 |
| 睡眠品質 3日連続低下 | "睡眠の質が3日連続で低下しています" | sleep_quality 連続減少 |
| Fitness 改善トレンド | "体力の蓄積が順調に改善しています" | fitness Δ7day > +3.0 |

---

## 7. 完了基準チェックリスト

- [x] 全計算式は確定的（LLM 不使用）であることが明示
- [x] EWMA パラメータ（Fitness 42日 / Fatigue 7日）の学術的根拠を記載
- [x] Readiness 正規化式と主観ペナルティの詳細仕様
- [x] Pro Mode HRV ペナルティの仕様
- [x] P1-P5 と Readiness スコアの独立性を明記
- [x] 統合ルール（P1-P4 時の色上書き）を定義
- [x] LLM 責務分離が ADR-029 として記録（別ファイル）
- [x] Gemini ダウン時のフォールバック動作を定義
- [x] daily_metrics 拡張不要の根拠を記載
- [x] plan-gates 拡張フラグ 7 件を定義
- [x] 段階的 Z-Score ウェイト（14日の崖解消）を定義
- [x] 傾向通知の仕様（判定色不変、trend_notices 追加のみ）を定義

---

## 変更履歴

| 日付 | Ver | 変更内容 |
|------|-----|---------|
| 2026-04-02 | 1.0 | 初版作成（PB-001-1〜PB-001-5 統合） |
