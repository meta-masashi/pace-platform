# GitHub Actions Secrets 設定ガイド

GitHub リポジトリの Settings > Secrets and variables > Actions に以下を登録してください。

## CI パイプライン用 Secrets

| Secret 名 | 説明 | 取得場所 |
|-----------|------|----------|
| `SUPABASE_URL` | Supabase プロジェクト URL | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key（統合テスト用） | Supabase Dashboard > Settings > API |
| `GEMINI_API_KEY` | Gemini API キー | https://aistudio.google.com/app/apikey |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL（ビルド用） | 上記と同じ値 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 匿名キー（ビルド用） | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe 公開キー | Stripe Dashboard > Developers > API keys |

## デプロイパイプライン用 Secrets

| Secret 名 | 説明 | 取得場所 |
|-----------|------|----------|
| `VERCEL_TOKEN` | Vercel API Token | https://vercel.com/account/tokens |
| `VERCEL_ORG_ID` | Vercel Organization ID | Vercel Dashboard > Settings > General |
| `VERCEL_PROJECT_ID` | Vercel Project ID | Vercel Dashboard > [Project] > Settings > General |
| `SUPABASE_PROJECT_REF` | Supabase プロジェクト参照ID | URL の `https://[ref].supabase.co` の `[ref]` 部分 |
| `SUPABASE_ACCESS_TOKEN` | Supabase アクセストークン（`supabase db push` 用） | https://app.supabase.com/account/tokens |

## 登録手順（GitHub CLI）

```bash
# --- CI用 ---
gh secret set SUPABASE_URL --body "https://[ref].supabase.co"
gh secret set SUPABASE_SERVICE_ROLE_KEY --body "[service-role-key]"
gh secret set GEMINI_API_KEY --body "[gemini-api-key]"
gh secret set NEXT_PUBLIC_SUPABASE_URL --body "https://[ref].supabase.co"
gh secret set NEXT_PUBLIC_SUPABASE_ANON_KEY --body "[anon-key]"
gh secret set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY --body "pk_live_..."

# --- デプロイ用 ---
gh secret set VERCEL_TOKEN --body "[vercel-token]"
gh secret set VERCEL_ORG_ID --body "[org-id]"
gh secret set VERCEL_PROJECT_ID --body "[project-id]"
gh secret set SUPABASE_PROJECT_REF --body "[project-ref]"
gh secret set SUPABASE_ACCESS_TOKEN --body "[access-token]"
```

## デプロイフロー（main ブランチ push 時）

```
1. deploy-supabase-migrations
   └── supabase db push --project-ref $SUPABASE_PROJECT_REF
       マイグレーションファイルをアルファベット順に本番 DB へ適用

2. deploy-frontend  (needs: deploy-supabase-migrations)
   └── vercel --prod
       スキーマ適用完了後にフロントエンドをデプロイ
```

**重要:** DB マイグレーションが失敗した場合、フロントエンドデプロイは自動的にスキップされます。

## 手動実行が必要な設定

以下は GitHub Actions では自動化せず、Supabase ダッシュボードで手動実行してください:

1. **pg_cron 拡張の有効化** — Dashboard > Database > Extensions > pg_cron を ON
2. **`20260322_rate_limit.sql`** — pg_cron 有効化後に SQL エディタで実行
3. **`20260322_realtime.sql`** — SQL エディタまたは Dashboard > Realtime で設定
4. **`004_auth_setup.sql`** — Auth ユーザー作成後に staff テーブルへの INSERT を実行
