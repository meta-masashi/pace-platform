# ADR-003: Supabase DB マイグレーション戦略

**ステータス:** 承認済み
**日付:** 2026-03-22
**決定者:** 05-architect エージェント

---

## 決定

Supabase CLI の `supabase db push` を用いた番号付きマイグレーションファイル管理を採用する。
デプロイパイプライン（`deploy.yml`）において DB マイグレーションをフロントエンドデプロイの**前**に実行することで、スキーマ先行適用を保証する。

---

## 状況

PACE Platform は医療データを扱うため、スキーマ変更とアプリケーションコードのデプロイ順序が critical である。
スキーマが古いまま新しいコードがデプロイされると、カラム不整合による本番障害が発生する。

---

## マイグレーションファイル構成

| ファイル名 | 内容 | 実行順 |
|-----------|------|--------|
| `001_schema.sql` | 全テーブル定義・インデックス・pgvector 拡張 | 1番 |
| `002_rls.sql` | RLS 有効化・ヘルパー関数・ポリシー定義（シンプル版） | 2番 |
| `001_initial_schema.sql` | 拡張スキーマ（ENUM型・トリガー・triage_list VIEW） | 3番 |
| `002_rls_policies.sql` | 詳細 RLS ポリシー（SECURITY DEFINER 関数付き） | 4番 |
| `003_seed.sql` | 開発用シードデータ（PACE FC / トップチーム） | 5番 |
| `004_auth_setup.sql` | 手動実行（Auth ユーザー作成後） | 手動のみ |
| `20260322_realtime.sql` | Supabase Realtime 設定 | 手動（ダッシュボード推奨） |
| `20260322_rate_limit.sql` | レートリミットログテーブル + pg_cron 設定 | 手動（pg_cron 有効化後） |

### ファイル命名規則

- `NNN_description.sql` — 連番形式（001, 002, ...）
- `YYYYMMDD_description.sql` — 日付形式（特定リリース向けパッチ）
- Supabase CLI はファイル名のアルファベット順でマイグレーションを適用する

---

## デプロイ順序方針

```
[CI: lint → test → build]
        ↓
[Deploy: supabase db push (本番)]   ← スキーマ先行
        ↓
[Deploy: vercel --prod]              ← コード後追い
```

**根拠:**
- スキーマ変更は後方互換性を維持しながら進める（`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`）
- コードが新カラムを参照する前にスキーマが存在している必要がある
- ロールバック時はコードを先にロールバックし、スキーマ変更は次フェーズで対処する

---

## pgvector 拡張

`001_schema.sql` で `CREATE EXTENSION IF NOT EXISTS "vector"` を実行することで
`supabase db push` 時に自動的に有効化される。

将来の RAG / 埋め込みベクトル検索機能（Gemini Embeddings API）のための前提拡張として有効化する。

---

## 手動実行が必要なマイグレーション

以下は自動化せず、管理者が Supabase ダッシュボード SQL エディタで手動実行する:

1. **`004_auth_setup.sql`** — Auth ユーザー作成後に staff テーブルへの INSERT が必要なため
2. **`20260322_realtime.sql`** — `ALTER PUBLICATION` はダッシュボードから実行が安定している
3. **`20260322_rate_limit.sql`** — pg_cron 拡張の有効化を先に Dashboard > Extensions で行う必要あり

---

## セキュリティ制約

| 制約 | 理由 |
|------|------|
| `SUPABASE_ACCESS_TOKEN` は GitHub Secrets にのみ保持 | CI/CD 環境変数として安全に管理 |
| `SUPABASE_SERVICE_ROLE_KEY` はサーバーサイドのみ | クライアントバンドルに含まれてはならない |
| RLS は全テーブルに必須 | マイグレーション後に `ENABLE ROW LEVEL SECURITY` を確認する |
| マイグレーションは冪等（Idempotent）に記述 | `IF NOT EXISTS` / `CREATE OR REPLACE` を使用する |

---

## 関連 ADR

- ADR-001: システムアーキテクチャ（4層分離）
- ADR-002: Gemini モデル移行（gemini-1.5-flash → gemini-2.0-flash）
