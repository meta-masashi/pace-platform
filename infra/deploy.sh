#!/usr/bin/env bash
# =============================================================================
# PACE Platform — AWS インフラ一括デプロイスクリプト
# 使用方法: ./infra/deploy.sh [environment] [aws-region] [aws-profile]
# 例:       ./infra/deploy.sh staging ap-northeast-1 default
#           ./infra/deploy.sh production ap-northeast-1 pace-prod
# =============================================================================

set -euo pipefail

ENVIRONMENT=${1:-staging}
AWS_REGION=${2:-ap-northeast-1}
AWS_PROFILE=${3:-default}
PROJECT_NAME="pace-platform"

echo "=============================================="
echo "PACE Platform AWS Infrastructure Deploy"
echo "Environment : ${ENVIRONMENT}"
echo "Region      : ${AWS_REGION}"
echo "Profile     : ${AWS_PROFILE}"
echo "=============================================="

export AWS_DEFAULT_REGION="${AWS_REGION}"
export AWS_PROFILE="${AWS_PROFILE}"

# ── 1. ECR Repository ──────────────────────────────────────────────────────
echo ""
echo "▶ [1/3] Creating ECR Repository..."
aws cloudformation deploy \
  --template-file infra/cloudformation/ecr-repository.yaml \
  --stack-name "${PROJECT_NAME}-ecr-${ENVIRONMENT}" \
  --parameter-overrides \
    Environment="${ENVIRONMENT}" \
    ProjectName="${PROJECT_NAME}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset

ECR_URI=$(aws cloudformation describe-stacks \
  --stack-name "${PROJECT_NAME}-ecr-${ENVIRONMENT}" \
  --query "Stacks[0].Outputs[?OutputKey=='RepositoryUri'].OutputValue" \
  --output text)
echo "✅ ECR Repository: ${ECR_URI}"

# ── 2. S3 + SQS + IAM ────────────────────────────────────────────────────
echo ""
echo "▶ [2/3] Creating S3 Buckets + SQS Queue + IAM Roles..."
aws cloudformation deploy \
  --template-file infra/cloudformation/s3-video-pipeline.yaml \
  --stack-name "${PROJECT_NAME}-video-pipeline-${ENVIRONMENT}" \
  --parameter-overrides \
    Environment="${ENVIRONMENT}" \
    ProjectName="${PROJECT_NAME}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset

# Retrieve outputs
RAW_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name "${PROJECT_NAME}-video-pipeline-${ENVIRONMENT}" \
  --query "Stacks[0].Outputs[?OutputKey=='RawVideosBucketName'].OutputValue" \
  --output text)
MASKED_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name "${PROJECT_NAME}-video-pipeline-${ENVIRONMENT}" \
  --query "Stacks[0].Outputs[?OutputKey=='MaskedVideosBucketName'].OutputValue" \
  --output text)
SQS_URL=$(aws cloudformation describe-stacks \
  --stack-name "${PROJECT_NAME}-video-pipeline-${ENVIRONMENT}" \
  --query "Stacks[0].Outputs[?OutputKey=='CVJobQueueUrl'].OutputValue" \
  --output text)
TASK_ROLE_ARN=$(aws cloudformation describe-stacks \
  --stack-name "${PROJECT_NAME}-video-pipeline-${ENVIRONMENT}" \
  --query "Stacks[0].Outputs[?OutputKey=='CVEngineTaskRoleArn'].OutputValue" \
  --output text)

echo "✅ Raw Bucket    : ${RAW_BUCKET}"
echo "✅ Masked Bucket : ${MASKED_BUCKET}"
echo "✅ SQS Queue     : ${SQS_URL}"
echo "✅ Task Role     : ${TASK_ROLE_ARN}"

# ── 3. SSM Secrets (manual values must be updated after) ─────────────────
echo ""
echo "▶ [3/3] Updating SSM Parameters..."
# Update SSM parameters that couldn't be auto-set by CloudFormation
# (SecureString requires KMS key — set via console or separately)

echo ""
echo "=============================================="
echo "✅ Infrastructure deployment complete!"
echo ""
echo "⚠️  次の手順を手動で実施してください:"
echo ""
echo "1. SSM Parameter Store で以下を SecureString に更新:"
echo "   /pace/cv/SUPABASE_SERVICE_ROLE_KEY = [your-supabase-service-role-key]"
echo "   /pace/cv/CV_INTERNAL_TOKEN         = $(openssl rand -hex 32)"
echo "   /pace/cv/SENTRY_DSN                = [your-sentry-dsn]"
echo ""
echo "2. GitHub Secrets に以下を設定:"
echo "   AWS_ACCESS_KEY_ID     = [IAM User access key]"
echo "   AWS_SECRET_ACCESS_KEY = [IAM User secret key]"
echo "   S3_RAW_BUCKET         = ${RAW_BUCKET}"
echo "   S3_MASKED_BUCKET      = ${MASKED_BUCKET}"
echo "   SQS_JOB_QUEUE_URL     = ${SQS_URL}"
echo "   CV_INTERNAL_TOKEN     = [same as SSM above]"
echo "   ECR_REGISTRY          = ${ECR_URI%/pace-cv-engine}"
echo ""
echo "3. Supabase で以下の SQL を手動実行:"
echo "   supabase/migrations/20260601_cv_pipeline_v2.sql"
echo "   supabase/migrations/20260501_dbn_schema.sql"
echo ""
echo "4. RunPod POC テスト:"
echo "   make -C pace-cv-engine build"
echo "   make -C pace-cv-engine gpu-verify"
echo "=============================================="
