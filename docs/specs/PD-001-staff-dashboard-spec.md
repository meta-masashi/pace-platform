# PD-001: Staff Dashboard — ファクトベース ROI 可視化仕様書

**バージョン:** 1.0
**作成日:** 2026-04-02
**ステータス:** ドラフト（レビュー待ち）
**準拠:** PACE v6.1 マスタープラン Phase 5（Audit-Driven ROI）
**データソース:** `inference_trace_logs`（100%確定的アルゴリズムが記録したファクト）

---

## 1. 概要

スタッフダッシュボードは `inference_trace_logs` を唯一のデータソースとし、
「推測ではなくファクト」としてチームのコンディション状況と ROI を可視化する。

**原則:** 表示される全ての数値は確定的パイプライン（Node 0-4）の出力に基づく。
LLM 由来の推測値は一切含まない。

---

## 2. PD-001-1: 4大 KPI カード

### KPI 定義

| # | KPI名 | 定義 | 算出SQL概要 | 色 | プラン |
|---|-------|------|-----------|-----|--------|
| 1 | **Critical** | 直近24h で P1/P2 判定された選手数 | `WHERE priority IN ('P1_SAFETY','P2_MECHANICAL_RISK') AND timestamp_utc > now()-'24h'` | `--red` | 全プラン |
| 2 | **Availability** | Readiness ≥ 60 の選手割合 | `athlete_condition_cache WHERE readiness_score >= 60` / 全選手数 | `--emerald` | 全プラン |
| 3 | **Team Peaking** | Readiness ≥ 80（zone）の選手割合 | `athlete_condition_cache WHERE readiness_score >= 80` / 全選手数 | `--teal` | Pro以上 |
| 4 | **Watchlist** | P3/P4 + Readiness 40-59 の選手数 | `WHERE priority IN ('P3_DECOUPLING','P4_GAS_EXHAUSTION') AND readiness < 60` | `--amber` | Pro以上 |

### プラン別表示

| プラン | 表示 KPI | 制限 KPI の表示 |
|--------|---------|---------------|
| Standard | Critical + Availability | Team Peaking, Watchlist はぼかし + "Pro で全データを表示" CTA |
| Pro / Pro+CV / Enterprise | 全4 KPI | — |

### カードレイアウト

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  Critical   │ │ Availability│ │ Team Peaking│ │  Watchlist  │
│   ● 2名     │ │   78%       │ │   35%       │ │   5名       │
│   --red     │ │   --emerald │ │   --teal    │ │   --amber   │
│   ↑1 vs 昨日│ │   ↓3% vs 昨日│ │   ↑5% vs 週│ │   →0 vs 昨日│
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

各カードにはスパークライン（7日トレンド）を含む。

---

## 3. PD-001-2: ファクトベース ROI レポート

### データソース

`inference_trace_logs` テーブル（append-only, 改竄不可）

### ROI 指標

| 指標 | 算出方法 | 表示例 |
|------|---------|--------|
| **P2 検知件数** | `COUNT(*) WHERE priority = 'P2_MECHANICAL_RISK' AND timestamp_utc >= 月初` | "今月 12 件の過負荷リスクを検知" |
| **負荷調整アシスト件数** | P2 検知後 48h 以内に `acknowledge_action = 'modified'` の件数 | "うち 8 件でスタッフが負荷調整を実施" |
| **推定回避離脱日数** | P2 modified 件数 × 平均離脱日数（初期値: 14日）× 回避確率（初期値: 0.6） | "推定 67 日分の離脱を回避" |
| **Critical 解消率** | P1 検知後 72h 以内に P5 復帰した割合 | "Critical の 85% が 72h 以内に解消" |

### 抽出 SQL

```sql
-- 月次 P2 検知件数
SELECT COUNT(*) AS p2_count
FROM inference_trace_logs
WHERE org_id = :org_id
  AND priority = 'P2_MECHANICAL_RISK'
  AND timestamp_utc >= date_trunc('month', now());

-- 負荷調整アシスト件数（P2 → 48h以内に modified）
SELECT COUNT(*) AS assisted_count
FROM inference_trace_logs
WHERE org_id = :org_id
  AND priority = 'P2_MECHANICAL_RISK'
  AND acknowledge_action = 'modified'
  AND acknowledged_at <= timestamp_utc + interval '48 hours'
  AND timestamp_utc >= date_trunc('month', now());
```

### ROI レポートカード（`.alert-card.alert-blue`）

```
┌──────────────────────────────────────────────────────┐
│ 📊 今月のファクトベース ROI レポート                     │
│                                                      │
│  過負荷リスク検知:  12 件                              │
│  負荷調整実施:      8 件（検知の 67%）                  │
│  推定回避離脱日数:  67 日（¥1,340,000 相当）           │
│  Critical 解消率:   85%（平均解消時間: 18h）           │
│                                                      │
│  ※ 全数値は PACE 確定的エンジンの判定ログに基づく       │
│    ファクトです。推測値は含まれません。                  │
└──────────────────────────────────────────────────────┘
```

**プランゲーティング:** `feature_risk_avoidance_report` — Pro 以上

---

## 4. PD-001-3: チャート仕様

### ACWR トレンドチャート

- X 軸: 日付（過去 30 日）
- Y 軸: ACWR 値
- チーム平均の折れ線グラフ
- **過負荷閾値 1.5 の `--amber` 点線**
- 安全ゾーン 0.8-1.3 を `--emerald` で薄く塗りつぶし
- プランゲーティング: `feature_acwr_trend_chart` — Pro 以上

### CalendarSyncChart（Google Calendar 連携）

- X 軸: 日付（今後 14 日 + 過去 14 日）
- 試合日 (`match`) を赤マーカーでプロット
- 高負荷練習日 (`high_intensity`) をアンバーマーカー
- ACWR トレンドを重ね描き
- **「試合 3 日前に ACWR 1.4 超過」などのアラートをチャート上に表示**
- プランゲーティング: `feature_calendar_sync` — Pro 以上

---

## 5. PD-001-4: アップグレード CTA 仕様

### Standard → Pro 導線

| トリガー | CTA 表示 | 配置 |
|---------|---------|------|
| Team Peaking / Watchlist KPI がぼかし状態 | "Pro プランで全 KPI を確認" ボタン | KPI カード上のオーバーレイ |
| ACWR トレンドチャート未表示 | "Pro プランで負荷トレンドを可視化" | チャートプレースホルダー内 |
| ROI レポート未表示 | "Pro プランで PACE の ROI を定量化" | レポートセクション |
| InsightCard 制限 | "Pro でパーソナライズアドバイスを受け取る" | InsightCard プレースホルダー |

### ぼかし表現

```css
.plan-restricted {
  filter: blur(6px);
  pointer-events: none;
  position: relative;
}
.plan-restricted::after {
  content: '';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

---

## 完了基準チェックリスト

- [x] ROI レポートのデータソースが `inference_trace_logs` に紐付け済み
- [x] P2 検知件数 / 推定回避離脱日数の計算式が確定
- [x] Standard / Pro のダッシュボード表示差分が明確化
- [x] 4大 KPI の定義・算出方法・プラン別表示を定義
- [x] ACWR トレンドチャート + CalendarSyncChart の仕様を定義
- [x] アップグレード CTA のトリガーと配置を定義
