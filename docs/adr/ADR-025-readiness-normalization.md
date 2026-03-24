# ADR-025: Readinessスコア正規化アルゴリズム・ステータス閾値

**ステータス:** 承認済み
**作成日:** 2026-03-24
**決定者:** @04-backend, @06-data-engineer, @02-ui-ux
**関連ADR:** ADR-020（EWMA）, ADR-021（ACWR）

---

## コンテキスト

Fitness-Fatigue EWMA から算出される生の差分値（fitness - fatigue）は任意の実数値を取り、そのままでは UI での表示・ステータス判定に使いにくい。

- スタッフダッシュボードでのトリアージ（critical / watchlist / normal / zone）
- モバイルホーム画面の ConditionRing（0〜100 スコア）
- AIコーチへのコンテキスト注入

のいずれにも統一された 0〜100 スケールが必要だった。

## 決定

### 正規化式

```
readiness_raw = 50 + (fitness - fatigue)
readiness     = clamp(readiness_raw × (1 - subjective_penalty), 0, 100)
```

- **ベースライン 50**: フィットネス = 疲労 の均衡状態でスコア 50
- **加算上限**: fitness - fatigue の最大差は実運用上 ±50 程度（α の性質上）
- **クランプ**: データ異常時に 0〜100 を外れないよう保護

### 主観ペナルティ係数

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

### ステータス閾値（スタッフダッシュボード）

| ステータス | 閾値 | 意味 | 対応色 |
|---|---|---|---|
| `critical` | < 40 | 練習参加制限検討 | Red |
| `watchlist` | 40〜59 | 注意観察 | Amber |
| `normal` | 60〜79 | 通常参加 | Slate |
| `zone` | ≥ 80 | 絶好調・積極起用 | Emerald |

### モバイルカラートークン（ConditionRing）

| スコア | カラー | ラベル |
|---|---|---|
| ≥ 85 | Teal `#0d9488` | 絶好調 |
| 70〜84 | Emerald `#10b981` | 良好 |
| 60〜69 | Amber `#d97706` | 普通 |
| < 60 | Red `#dc2626` | 要注意 |

## 閾値設定の根拠

- スポーツ医学文献では「パフォーマンス低下が明確になる疲労蓄積」が EWMA ベースで fitness を 10〜15 ポイント下回る時点とされる
- 50±10 付近（40〜60）を watchlist ゾーンとし、臨床判断のトリガーとした
- 「zone（80+）」は `safe`（low risk of injury）に相当し、積極的なトレーニング負荷増加を推奨できる水準

## 結果

- `athlete_condition_cache.readiness_score` に 0〜100 値を保存（`CHECK BETWEEN 0 AND 100`）
- ダッシュボード・モバイルは共通のスコアを参照
- 将来的に Level 2（HRVデバイス連携）では `hrv_baseline_delta` をペナルティに追加で組み込む予定
