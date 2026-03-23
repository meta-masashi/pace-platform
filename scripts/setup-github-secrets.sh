#!/usr/bin/env bash
# =============================================================================
# PACE Platform — GitHub Secrets 一括設定スクリプト
# 
# 前提条件:
#   - GitHub CLI (gh) がインストール済み: brew install gh
#   - ログイン済み: gh auth login
#   - AWS CLI がインストール済み
#
# 使用方法:
#   ./scripts/setup-github-secrets.sh
#
# 実行前に以下の変数を環境変数で設定してください:
#   export VERCEL_TOKEN="your-vercel-token"
#   export VERCEL_ORG_ID="your-org-id"
#   export VERCEL_PROJECT_ID="your-project-id"
#   export NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
#   export NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
#   export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
#   export GEMINI_API_KEY="AIza..."
#   export STRIPE_SECRET_KEY="sk_live_..."
#   export STRIPE_WEBHOOK_SECRET="whsec_..."
#   export NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."
#   export AWS_ACCESS_KEY_ID="AKIA..."
#   export AWS_SECRET_ACCESS_KEY="..."
#   export S3_RAW_BUCKET="pace-platform-raw-videos-production"
#   export S3_MASKED_BUCKET="pace-platform-masked-videos-production"
#   export SQS_JOB_QUEUE_URL="https://sqs.ap-northeast-1.amazonaws.com/..."
#   export CV_INTERNAL_TOKEN="$(openssl rand -hex 32)"
#   export ECR_REGISTRY="123456789.dkr.ecr.ap-northeast-1.amazonaws.com"
#   export SENTRY_DSN="https://..."
#   export SUPABASE_ACCESS_TOKEN="sbp_..."
#   export SUPABASE_PROJECT_REF="abcdefghij"
# =============================================================================

set -euo pipefail

# ── GitHub リポジトリを自動検出 ────────────────────────────────────────────
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null || echo "")
if [ -z "$REPO" ]; then
  echo "❌ GitHub リポジトリが検出できません。git remote を確認してください。"
  exit 1
fi
echo "📁 Repository: ${REPO}"

# ── ヘルパー関数 ───────────────────────────────────────────────────────────
set_secret() {
  local NAME=$1
  local VALUE=$2
  if [ -z "$VALUE" ]; then
    echo "  ⏭  SKIP ${NAME} (値が空です)"
    return
  fi
  echo "$VALUE" | gh secret set "$NAME" --repo "$REPO" --body -
  echo "  ✅ ${NAME}"
}

echo ""
echo "=== Vercel Secrets ==="
set_secret "VERCEL_TOKEN"      "${VERCEL_TOKEN:-}"
set_secret "VERCEL_ORG_ID"     "${VERCEL_ORG_ID:-}"
set_secret "VERCEL_PROJECT_ID" "${VERCEL_PROJECT_ID:-}"

echo ""
echo "=== Supabase Secrets ==="
set_secret "NEXT_PUBLIC_SUPABASE_URL"      "${NEXT_PUBLIC_SUPABASE_URL:-}"
set_secret "NEXT_PUBLIC_SUPABASE_ANON_KEY" "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"
set_secret "SUPABASE_SERVICE_ROLE_KEY"     "${SUPABASE_SERVICE_ROLE_KEY:-}"
set_secret "SUPABASE_ACCESS_TOKEN"         "${SUPABASE_ACCESS_TOKEN:-}"
set_secret "SUPABASE_PROJECT_REF"          "${SUPABASE_PROJECT_REF:-}"

echo ""
echo "=== Gemini / AI Secrets ==="
set_secret "GEMINI_API_KEY" "${GEMINI_API_KEY:-}"

echo ""
echo "=== Stripe Secrets ==="
set_secret "STRIPE_SECRET_KEY"                "${STRIPE_SECRET_KEY:-}"
set_secret "STRIPE_WEBHOOK_SECRET"            "${STRIPE_WEBHOOK_SECRET:-}"
set_secret "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" "${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:-}"

echo ""
echo "=== AWS / CV Engine Secrets ==="
set_secret "AWS_ACCESS_KEY_ID"     "${AWS_ACCESS_KEY_ID:-}"
set_secret "AWS_SECRET_ACCESS_KEY" "${AWS_SECRET_ACCESS_KEY:-}"
set_secret "S3_RAW_BUCKET"         "${S3_RAW_BUCKET:-}"
set_secret "S3_MASKED_BUCKET"      "${S3_MASKED_BUCKET:-}"
set_secret "SQS_JOB_QUEUE_URL"     "${SQS_JOB_QUEUE_URL:-}"
set_secret "CV_INTERNAL_TOKEN"     "${CV_INTERNAL_TOKEN:-}"
set_secret "ECR_REGISTRY"          "${ECR_REGISTRY:-}"

echo ""
echo "=== Observability ==="
set_secret "SENTRY_DSN" "${SENTRY_DSN:-}"

echo ""
echo "==================================="
echo "✅ GitHub Secrets 設定完了"
echo ""
echo "確認: gh secret list --repo ${REPO}"
echo "==================================="
