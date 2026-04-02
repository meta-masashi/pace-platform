# PC-001: Athlete UI — UI Firewall（摩擦ゼロ側）仕様書

**バージョン:** 1.0
**作成日:** 2026-04-02
**ステータス:** ドラフト（レビュー待ち）
**準拠:** PACE v6.1 マスタープラン Phase 2（UI Firewall — 摩擦ゼロ体験）
**関連ADR:** ADR-024（チェックイン UX）, ADR-025（Readiness 正規化）, ADR-026（デザインシステム v2.0）

---

## 1. 概要

選手側 UI は「摩擦ゼロの体験」を提供する。
専門用語を排除し、感覚的ラベル + 色 + 絵文字で状態を伝える。

**UI Firewall 原則:**
- 選手には「分かりやすさ」を、スタッフには「高解像度」を
- 同一データを MetricLabel 二層表現で変換
- 数式は UI に一切表示しない（Math-Invisible Design）

---

## 2. PC-001-1: ConditionCircleRing + KpiBreakdownRow

### ConditionCircleRing

Readiness スコアを環状プログレスバーで表示する。

**レイアウト:**
```
       ╭────────╮
      │  82     │    ← 大きな数字（Readiness スコア）
      │  好調 🟢 │    ← 感覚的ラベル + 絵文字
       ╰────────╯
    ━━━━━━━━━━━━━━    ← 環状プログレスバー（色付き）
```

**カラーマッピング（選手向け）:**

| スコア | 色 | ラベル | 絵文字 |
|--------|-----|--------|-------|
| ≥ 85 | Teal `#0d9488` | 絶好調 | 🔥 |
| 70-84 | Emerald `#10b981` | 好調 | 🟢 |
| 60-69 | Amber `#d97706` | まあまあ | 🟡 |
| 40-59 | Orange `#ea580c` | やや不調 | 🟠 |
| < 40 | Red `#dc2626` | 要注意 | 🔴 |

### KpiBreakdownRow（3大サブ指標）

ConditionCircleRing の下に 3 つのサブ指標を横並びで表示。

| # | 選手向け表示 | スタッフ向け表示 | データソース |
|---|------------|----------------|------------|
| 1 | 体力の蓄積 `65` | Fitness (42日EWMA) `65.0` | `athlete_condition_cache.fitness_score` |
| 2 | 疲労の状態 `42` | Fatigue (7日EWMA) `42.0` | `athlete_condition_cache.fatigue_score` |
| 3 | 負荷バランス `最適 🟢` | ACWR `1.12` (Acute 420 / Chronic 375) | `athlete_condition_cache.acwr` |

### MetricLabel 二層表現の実装

```typescript
interface MetricLabelProps {
  metric: 'readiness' | 'fitness' | 'fatigue' | 'acwr' | 'pain' | 'hrv';
  value: number;
  detail?: { acute?: number; chronic?: number };
}

function MetricLabel({ metric, value, detail }: MetricLabelProps) {
  const role = useUserRole(); // 'athlete' | 'staff'

  if (role === 'athlete') {
    return <AthleteMetricLabel metric={metric} value={value} />;
  }
  return <StaffMetricLabel metric={metric} value={value} detail={detail} />;
}
```

**変換ルール表:**

| 指標 | 選手向け（低解像度） | スタッフ向け（高解像度） |
|------|-------------------|----------------------|
| Readiness | 「好調」🟢 82/100 | Readiness 82.0 (Fitness 75.2 - Fatigue 42.3) |
| ACWR | 「最適」🟢 | ACWR 1.12 (Acute 420 / Chronic 375) |
| Fitness | 「標準」🟡 65 | Fitness (42日EWMA) 65.0 |
| Fatigue | 「58%」🟢 | Fatigue (7日EWMA) 42.0 |
| Pain | 😟 6/10 | Pain (NRS) 6/10 — Type: muscular |
| HRV | 「良好」🟢 +5 | HRV (RMSSD Δbaseline) +5.0ms |

---

## 3. PC-001-2: InsightCard（Pro 限定）

### 表示条件

| プラン | 表示 |
|--------|------|
| Standard | プレースホルダー + "Pro でパーソナライズアドバイスを受け取る" CTA |
| Pro 以上 | Gemini NLG による日本語アドバイス |

### InsightCard コンテンツ

```
┌──────────────────────────────────────────┐
│ 💡 今日のアドバイス                        │
│                                          │
│ コンディションは良好です。昨日のトレーニング │
│ からの回復も順調です。今日は通常メニューで   │
│ 問題ありません。                           │
│                                          │
│ 負荷バランスも最適な範囲内です。この調子を   │
│ 維持しましょう。                           │
└──────────────────────────────────────────┘
```

**テキスト生成ルール:**
- 専門用語を使用しない（ACWR, EWMA, Z-Score 等は禁止）
- 肯定的フレーミングを優先（「回復が遅い」→「もう少し休息を取りましょう」）
- 最大 150 文字
- P1-P4 判定時は警告トーン、P5 時は肯定トーン

### LLM ダウン時フォールバック

テンプレートテキストを Readiness ステータスに基づいて選択:

```typescript
const FALLBACK_TEMPLATES = {
  zone: '絶好調です！今日は積極的にトレーニングできます。',
  normal: 'コンディションは良好です。通常メニューで問題ありません。',
  watchlist: '少し疲労が溜まっています。無理せず調整しましょう。',
  critical: '体調管理に注意が必要です。スタッフに相談してください。',
};
```

---

## 4. PC-001-3: AdaptiveCheckinForm

### 基本仕様

Bio-Swipe をスライダーフォームに変更。質問は最大 6 問。

### 質問順序ランダム化（自動操縦防止）

**目的:** 毎日同じ順序で質問すると「慣れ」により機械的に回答するようになる。
ランダム化により各質問への注意を維持する。

```typescript
function shuffleQuestions(questions: Question[], seed: string): Question[] {
  // 日付 + athlete_id をシードとした擬似ランダム
  // 同じ日・同じ選手には同じ順序を保証（再入力時の一貫性）
  const seeded = seedRandom(`${seed}-${new Date().toDateString()}`);
  return [...questions].sort(() => seeded() - 0.5);
}
```

### Fatigue Focus モード

高負荷トレーニング後（ACWR > 1.3 or sRPE > 70）は質問を 3 問に絞り込む:

| # | 質問 | 入力 |
|---|------|------|
| 1 | 疲労感 | スライダー 1-10 |
| 2 | 睡眠の質 | スライダー 1-5 |
| 3 | 痛みの有無 | あり/なし → ありの場合 NRS 0-10 |

### Vigor モード

Readiness ≥ 80 かつ 3 日連続改善時:
- 「調子が良いですね！」メッセージを表示
- 通常 6 問を維持（データ収集のため）

### 完了後のスコア即時表示（<1秒）

チェックイン送信後、**1 秒以内** に ConditionCircleRing を更新表示する。

実装:
1. チェックイン POST 完了時のレスポンスに `readiness_score` を含める
2. クライアント側で即座に ConditionCircleRing を更新（楽観的更新）
3. バックグラウンドで `athlete_condition_cache` の UPSERT を実行

---

## 5. PC-001-4: トライアル → 有料転換タッチポイント

### Day 7 連続チェックイン達成

```
┌──────────────────────────────────────────┐
│ 🎉 7日連続チェックイン達成！                │
│                                          │
│ Pro プランでは AI があなた専用のアドバイスを │
│ 毎日届けます。                             │
│                                          │
│ [Pro 機能をプレビュー]  [後で]              │
└──────────────────────────────────────────┘
```

Pro 機能プレビュー: InsightCard のサンプルを 1 回だけ表示

### Day 14 トライアル期限接近

```
┌──────────────────────────────────────────┐
│ トライアル期間が残り 7 日です               │
│                                          │
│ Standard プランでもコンディション管理は継続 │
│ できます。Pro にアップグレードすると:       │
│  ✓ AI パーソナライズアドバイス              │
│  ✓ ACWR トレンド分析                      │
│  ✓ Google Calendar 連携                   │
│                                          │
│ [Pro にアップグレード]  [Standard で継続]   │
└──────────────────────────────────────────┘
```

### Standard 降格時の Upgrade CTA

Pro トライアル終了 → Standard 降格時:
- InsightCard 枠に "Pro で復活" CTA を常時表示
- ACWR チャート枠にぼかし + "Pro で負荷トレンドを確認" CTA

---

## 完了基準チェックリスト

- [x] MetricLabel の選手向け / スタッフ向け変換ルール表が確定
- [x] ConditionCircleRing のカラー・ラベル・絵文字マッピング定義
- [x] KpiBreakdownRow の 3 大サブ指標定義
- [x] InsightCard の Pro 限定 + LLM フォールバック動作定義
- [x] チェックインの質問順序ランダム化ロジック定義
- [x] Fatigue Focus / Vigor モードの条件・質問定義
- [x] 完了後スコア即時表示（<1秒）の実装方針定義
- [x] トライアル転換タッチポイント（Day 7, Day 14, 降格時）定義
