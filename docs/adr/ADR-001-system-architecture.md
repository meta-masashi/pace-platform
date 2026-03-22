# ADR-001: pace-platform システムアーキテクチャ

**ステータス:** 承認済み
**日付:** 2026-03-22
**決定者:** 05-architect エージェント

---

## 決定

Next.js 15 (App Router) + Supabase + Gemini API を中核とした、
4層レイヤー分離アーキテクチャを採用する。

---

## 状況

スポーツ医科学プラットフォーム `pace-platform` は以下の要件を持つ:

- 選手の身体データ・SOAP記録・トリアージ評価の管理
- AI による評価支援（Gemini API）
- チームトレーニング・リハビリ管理
- 複数ユーザーロール（管理者・コーチ・トレーナー・選手）によるアクセス制御

モノリシック構成では認証・AI推論・データ永続化が密結合となりメンテナンス性が低下するため、
レイヤー分離アーキテクチャの意思決定が必要となった。

---

## 選択肢

### 案A（採用）: Vercel + Supabase + Gemini API の4層分離構成

```
[フロントエンド層: Vercel]
  Next.js 15 App Router / Server Components / Streaming UI
  ↓ HTTPS / JWT
[API層: Next.js API Routes + Supabase Edge Functions]
  ビジネスロジック / 認証ミドルウェア / レートリミット
  ↓ PostgreSQL Protocol / REST
[データ層: Supabase PostgreSQL]
  RLS (Row Level Security) / pgvector / リアルタイムサブスクリプション
  ↓ REST / gRPC
[AI層: Gemini API / LangChain]
  推論 / RAG / プロンプト管理 / ストリーミングレスポンス
```

**採用理由:**
- Supabase の RLS により DB レベルでのアクセス制御が実現できる
- Vercel の Edge Runtime により低レイテンシを確保できる
- Gemini API のストリーミング対応により AI レスポンスのUXが向上する

### 案B（不採用）: AWS フルスタック構成（ECS + RDS + Bedrock）

**不採用理由:**
- 初期コストと運用コストが大幅に増加する
- Supabase の RLS・pgvector が既に実装済みのため移行コストが高い
- チーム規模に対してオーバースペックである

---

## レイヤー分離方針

### フロントエンド（Vercel）
- **責務:** UI / UX / SSR / ISR / 静的アセット配信
- **技術:** Next.js 15 App Router, Server Components, Tailwind CSS
- **制約:** ビジネスロジックを含まない / Service Role Key を参照しない

### API層（Next.js API Routes + Supabase Edge Functions）
- **責務:** ビジネスロジック / JWT検証 / レートリミット / AI推論オーケストレーション
- **技術:** Next.js Route Handlers, Supabase Edge Functions (Deno)
- **制約:** DB直接アクセスは Supabase クライアント経由のみ

### データ層（Supabase PostgreSQL）
- **責務:** データ永続化 / RLS / pgvector によるベクトル検索
- **技術:** PostgreSQL 17, pgvector, Supabase Realtime
- **制約:** RLS を全テーブルに適用 / Service Role Key はサーバーサイドのみ

### AI層（Gemini API / LangChain）
- **責務:** AI推論 / RAG / プロンプトテンプレート管理
- **技術:** @google/generative-ai, LangChain (将来導入)
- **制約:** API Key はサーバーサイド環境変数のみ / コスト上限を設定する

---

## 結果

**メリット:**
- RLS により SQL インジェクション・権限昇格リスクを DB レベルで防御できる
- レイヤーごとに独立してスケールアウト・デプロイができる
- Vercel + Supabase の無料枠から開始しコストを最小化できる

**デメリット:**
- Supabase Edge Functions (Deno) と Next.js API Routes の役割分担の判断が必要
- コールドスタート問題（Edge Functions）が一部のエンドポイントで発生しうる

**対策:**
- コールドスタートが許容できないエンドポイントは Next.js API Routes に実装する
- 非同期・バックグラウンド処理は Supabase Edge Functions に委譲する

---

## セキュリティ方針（防壁）

| 防壁 | 対策 |
|------|------|
| モック実装の排除 | 全 AI 呼び出しは実 Gemini API エンドポイントを使用 |
| AIセキュリティ | プロンプトインジェクション対策・入力サニタイズ |
| コスト保護 | Gemini API の `maxOutputTokens` 設定・月次上限アラート |
| 耐障害性 | Supabase の Connection Pooling・Vercel の Edge キャッシュ |

---

## 本番環境情報

| 項目 | 値 |
|------|-----|
| GitHub リポジトリ | https://github.com/meta-masashi/pace-platform |
| Vercel プロジェクト | pace-platform (`prj_GAHZ1R4k8UHBUi2hBogG6iBeTd6j`) |
| Vercel 本番 URL | https://pace-platform-delta.vercel.app |
| Vercel Org | `team_W3XNPycaKqK0PoJEoFLsUtA2` |

## CI/CD パイプライン構成

| ワークフロー | トリガー | 内容 |
|-------------|---------|------|
| `.github/workflows/ci.yml` | push/PR on main, develop | lint → type-check → migration validate → unit test → integration test → build |
| `.github/workflows/deploy.yml` | push on main | supabase db push → vercel --prod |

## 関連 ADR

- ADR-002: Gemini モデル移行（gemini-1.5-flash → gemini-2.0-flash）
- ADR-003: Supabase DB マイグレーション戦略（05-architect 担当）
