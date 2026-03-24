# ADR-002: コンディション・スコアエンジン（ハイブリッド・ピーキング）

## 状況

実装変更指示書により、ACWR 単体表示から sRPE EWMA ベースの「コンディション・スコア」に移行する。
デバイスの有無を問わず機能するハイブリッドモデルが必要。

## 決定

### 算出ロジック

```
Fitness  = EWMA(sRPE, 42日間)   // 長期フィットネス蓄積
Fatigue  = EWMA(sRPE, 7日間)    // 短期疲労負荷
         + 主観ペナルティ(睡眠, 疲労感)

Readiness = normalize(Fitness - Fatigue, 0, 100)

// Pro Mode（HRVデバイス連携時）
if HRV < baseline:
  Fatigue *= penalty_coefficient
  Readiness = recalculate()
```

### DB スキーマへの影響

`daily_metrics` テーブルに以下のカラム追加が必要（Phase B マイグレーション）:

```sql
ALTER TABLE public.daily_metrics
  ADD COLUMN IF NOT EXISTS srpe FLOAT,              -- session RPE（主観的運動強度 × 時間）
  ADD COLUMN IF NOT EXISTS training_duration_min INT, -- トレーニング時間（分）
  ADD COLUMN IF NOT EXISTS rpe FLOAT CHECK (rpe >= 0 AND rpe <= 10), -- 主観的運動強度
  ADD COLUMN IF NOT EXISTS fatigue_subjective FLOAT CHECK (fatigue_subjective >= 0 AND fatigue_subjective <= 10),
  ADD COLUMN IF NOT EXISTS conditioning_score FLOAT CHECK (conditioning_score >= 0 AND conditioning_score <= 100),
  ADD COLUMN IF NOT EXISTS fitness_ewma FLOAT,      -- 42日EWMA（キャッシュ）
  ADD COLUMN IF NOT EXISTS fatigue_ewma FLOAT,      -- 7日EWMA（キャッシュ）
  ADD COLUMN IF NOT EXISTS hrv_baseline FLOAT;      -- HRVベースライン（Pro Mode）
```

### 既存カラムとの関係

| 既存カラム | 対応 |
|-----------|------|
| `acwr` | **維持**。現場の目安として引き続き計算・表示 |
| `nrs` | **維持**。疼痛スケール（アセスメントのトリガー） |
| `hrv` | **維持**。Pro Mode のペナルティ係数入力 |
| `sleep_score` | **維持**。主観ペナルティの入力 |
| `hp_computed` | **conditioning_score に置換**。hp_computed は deprecated |

### API 設計

```
POST /api/checkin           → sRPE + 主観データ受信 → conditioning_score 算出・保存
GET  /api/conditioning/:id  → 選手個別の Readiness + Fitness/Fatigue 内訳
GET  /api/team/peaking      → チーム平均コンディション・スコア + Availability
```

## 選択肢

- **案A（採用）**: EWMA をサーバーサイドで毎回算出。`fitness_ewma` / `fatigue_ewma` をキャッシュカラムとして保持。
  - メリット: 過去データ修正時に再計算可能、クライアント負荷ゼロ
  - デメリット: 42日分のデータ取得が毎回必要（インデックスで緩和可能）

- **案B（不採用）**: クライアントサイドで EWMA 算出。
  - 不採用理由: 選手アプリとスタッフアプリで二重実装が必要、データ整合性リスク

## 結果

- Phase B で `daily_metrics` スキーマ拡張マイグレーション（015）を作成
- `hp_computed` は deprecated マーク。新規コードでは `conditioning_score` を使用
- EWMA 算出ロジックは `lib/conditioning/` に新規モジュールとして実装
- Pro Mode のHRVペナルティ係数は `0.85`（デフォルト値、設定可能）
