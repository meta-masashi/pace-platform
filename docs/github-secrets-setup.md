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
| `SUPABASE_ACCESS_TOKEN` | Supabase アクセストークン | https://app.supabase.com/account/tokens |

## 登録手順

```bash
# GitHub CLI を使って一括登録する場合
gh secret set SUPABASE_URL --body "https://[ref].supabase.co"
gh secret set SUPABASE_SERVICE_ROLE_KEY --body "[service-role-key]"
gh secret set GEMINI_API_KEY --body "[gemini-api-key]"
gh secret set NEXT_PUBLIC_SUPABASE_URL --body "https://[ref].supabase.co"
gh secret set NEXT_PUBLIC_SUPABASE_ANON_KEY --body "[anon-key]"
gh secret set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY --body "pk_live_..."
gh secret set VERCEL_TOKEN --body "[vercel-token]"
gh secret set VERCEL_ORG_ID --body "[org-id]"
gh secret set VERCEL_PROJECT_ID --body "[project-id]"
gh secret set SUPABASE_PROJECT_REF --body "[project-ref]"
gh secret set SUPABASE_ACCESS_TOKEN --body "[access-token]"
```
