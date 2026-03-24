# ADR-020: フィットネス疲労理論（EWMA）採用

**ステータス:** 承認済み
**作成日:** 2026-03-24
**決定者:** @04-backend, @06-data-engineer
**関連ADR:** ADR-021（ACWR算出）, ADR-022（athlete_condition_cache）

---

## コンテキスト

選手コンディションを「単日 NRS/HRV」だけでなく、時系列的な疲労蓄積と適応度から評価したい。スポーツ科学界では **Fitness-Fatigue Model（Banister, 1991）** が標準的なフレームワークとして確立されており、以下の2成分で構成される。

- **フィットネス（長期適応）**: トレーニング刺激の累積効果。時定数 τ ≈ 42日
- **疲労（短期疲労）**: 直近のトレーニングによる一時的なパフォーマンス低下。時定数 τ ≈ 7日

実装方法の候補として以下を検討した：

| 方法 | 特徴 | 課題 |
|---|---|---|
| 単純移動平均（SMA） | 実装が容易 | 全過去データに均等重み → 直近の変化が反映されにくい |
| **EWMA（指数加重移動平均）** | 直近データに高いウェイト、過去は指数関数的に減衰 | α の設定が重要 |
| ガウシアンカーネル | 滑らかな曲線 | 計算コストが高く、リアルタイム更新に不向き |

## 決定

**EWMA（Exponentially Weighted Moving Average）を採用する。**

α 係数は標準的な時定数変換式 α = 2/(τ+1) を使用：

```
α_fitness = 2 / (42 + 1) ≈ 0.0465   （42日指数加重）
α_fatigue = 2 / (7 + 1)  = 0.25      （7日指数加重）

fitness[t] = fitness[t-1] + α_fitness × (load[t] - fitness[t-1])
fatigue[t] = fatigue[t-1] + α_fatigue × (load[t] - fatigue[t-1])
```

**負荷指標（load）**: `srpe`（Session RPE, 0〜100）を使用。
未記入日は `load = 0` として計算を継続する（休養日として扱う）。

**Readiness スコア正規化**:

```
readiness_raw = 50 + (fitness - fatigue)
readiness     = clamp(readiness_raw × (1 - subjective_penalty), 0, 100)
```

## 結果

- チェックイン API（`/api/athlete/checkin`）が直近42日の `srpe` を取得し、EWMA を oldest→newest で再計算
- 計算結果は `athlete_condition_cache` に UPSERT（ADR-022 参照）
- 主観ペナルティ（`sleep_quality` / `fatigue_feeling` < 3 時）で最大 10% 減算

## トレードオフ

- **初期値問題**: チェックイン開始直後はデータ不足で不安定。初期フィットネス = 0 で開始し、2週間以降に安定化する設計とした
- **srpe の代理指標性**: 実際の運動強度 × 時間が理想だが、選手入力の簡便さを優先して主観 RPE（0〜100）を採用
