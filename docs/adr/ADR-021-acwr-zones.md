# ADR-021: ACWR算出方法・ゾーン判定閾値

**ステータス:** 承認済み
**作成日:** 2026-03-24
**決定者:** @04-backend, @06-data-engineer
**関連ADR:** ADR-020（Fitness-Fatigue EWMA）, ADR-022（athlete_condition_cache）

---

## コンテキスト

急性:慢性負荷比（Acute:Chronic Workload Ratio, ACWR）は、直近の急性負荷と慢性的な適応基盤の比を表し、過負荷傷害リスクの予測指標として広く使用されている（Gabbett, 2016）。

ACWR の計算方法と閾値設定について検討が必要であった。

## 決定

### 計算方式: SMA（単純移動平均）ベース

```
acwr_acute   = mean(srpe of last 7 days)   # 急性負荷
acwr_chronic = mean(srpe of last 28 days)  # 慢性負荷（週平均）
acwr         = acwr_acute / acwr_chronic   # chronic = 0 の場合は 1.0
```

EWMA ベースの ACWR（Hulin et al.）も検討したが、チームスタッフへの説明容易性と Gabbett (2016) の参照先との一致を優先して SMA を採用。

### ゾーン判定閾値

| ゾーン | 範囲 | 意味 | 対応カラー |
|---|---|---|---|
| `safe` | ACWR < 0.8 | 低負荷・デトレーニングリスク | Blue |
| `optimal` | 0.8 ≤ ACWR ≤ 1.3 | 適正ゾーン（目標範囲） | Green (emerald) |
| `caution` | 1.3 < ACWR ≤ 1.5 | 注意：傷害リスク上昇 | Amber |
| `danger` | ACWR > 1.5 | 過負荷：傷害リスク高 | Red |

閾値は Gabbett (2016) "The training—injury prevention paradox" の推奨値に準拠。

### DB スキーマ

`athlete_condition_cache` に以下を保存：

```sql
acwr         NUMERIC  -- 比率値
acwr_acute   NUMERIC  -- 7日平均負荷
acwr_chronic NUMERIC  -- 28日平均負荷
```

### フロントエンド表示

- **モバイル（index.tsx）**: `ACWRGauge` コンポーネント（ゲージバー + セーフゾーン緑表示）
- **スタッフダッシュボード**: `AcwrBadge` コンポーネント（ゾーン別カラーバッジ）

## トレードオフ

- **28日データ不足時**: 新規選手は chronic が不安定。14日未満のデータでは ACWR 表示を非推奨とし、`no_data` フラグで通知する方向で対応
- **srpe=0 の扱い**: 休養日も平均計算に含める（除外すると chronic が過大評価になりACWRが過小になる）
