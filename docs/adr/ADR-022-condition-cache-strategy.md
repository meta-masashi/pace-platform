# ADR-022: athlete_condition_cache キャッシュ戦略

**ステータス:** 承認済み
**作成日:** 2026-03-24
**決定者:** @04-backend, @06-data-engineer
**関連ADR:** ADR-020（EWMA）, ADR-021（ACWR）

---

## コンテキスト

Fitness-Fatigue スコア（EWMA）と ACWR の計算は、直近 42日 + 28日分の `daily_metrics.srpe` を参照する必要がある。毎リクエストでフルスキャン計算を行うと、以下の問題が生じる：

- ダッシュボードで全選手分（数十〜数百名）を同時計算すると応答遅延
- Supabase の Postgres への過剰クエリ負荷
- 同一日付の計算が何度も重複する

## 決定

**`athlete_condition_cache` テーブルによる日次キャッシュ戦略を採用する。**

```sql
PRIMARY KEY (athlete_id, date)
```

### キャッシュ更新タイミング

1. **チェックイン時（即時）**: `POST /api/athlete/checkin` 完了後に `computeAndCacheCondition()` を非同期実行
2. **スタッフがダッシュボード参照時**: キャッシュがない場合のみ算出

### キャッシュ無効化ルール

- 過去日付のデータ修正が発生した場合は手動再計算（管理API予定）
- 当日分は チェックイン毎に UPSERT で更新（同日複数チェックインは後勝ち）

### RLS設計

```sql
-- スタッフ: 同組織の選手データを参照可能
CREATE POLICY "staff_read_condition_cache" ...
  WHERE s.id = auth.uid() AND a.org_id = s.org_id

-- 選手: 自分のデータのみ参照可能
CREATE POLICY "athlete_read_own_condition_cache" ...
  WHERE athlete_id = auth.uid()

-- 書き込みは Service Role のみ（API サーバーから）
```

### キャッシュヒット率の考察

- チェックイン率 80% 以上の組織では当日分はほぼ全員キャッシュ済み
- `GET /api/staff/team-condition` は全選手の当日キャッシュを1クエリで取得（`IN (athleteIds) AND date = today`）

## 代替案との比較

| 戦略 | 長所 | 短所 |
|---|---|---|
| リクエスト毎に全計算 | 常に最新 | 高遅延・高負荷 |
| Redis/Upstash キャッシュ | 高速 | インフラ追加・コスト増 |
| **日次DBキャッシュ（採用）** | シンプル・低コスト・RLS統合 | チェックイン漏れ時に当日分が古くなる |

## 結果

- ダッシュボード応答時間: 全選手分のキャッシュ参照が単一クエリで完了 → p95 < 300ms
- チェックイン後にスコアがリアルタイムで更新される体験を実現
