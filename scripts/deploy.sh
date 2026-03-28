#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CFN_DIR="$PROJECT_ROOT/infra/cfn"

ENV="${1:-dev}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"

# Load .env file if it exists (for GITHUB_TOKEN, GITHUB_MODEL_ID, etc.)
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
  echo "Loaded .env from $PROJECT_ROOT/.env"
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "ERROR: GITHUB_TOKEN is not set. Add it to .env or export it."
  exit 1
fi
STACK_NAME="algo-trade-${ENV}"
TEMPLATES_BUCKET="${TEMPLATES_BUCKET:-algo-trade-templates-$(aws sts get-caller-identity --query Account --output text)}"
LAMBDA_S3_BUCKET="${LAMBDA_S3_BUCKET:-algo-trade-deploy-$(aws sts get-caller-identity --query Account --output text)}"
DEPLOY_ID="${DEPLOY_ID:-$(date +%Y%m%d%H%M%S)}"
LAMBDA_S3_KEY="${LAMBDA_S3_KEY:-algo-trade/lambda-deployment-${DEPLOY_ID}.zip}"

if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
  echo "Usage: $0 [dev|prod]"
  exit 1
fi

echo "=== Deploying algo-trade [${ENV}] to ${AWS_REGION} ==="
echo "--- Lambda package key: s3://${LAMBDA_S3_BUCKET}/${LAMBDA_S3_KEY} ---"

if ! aws sts get-caller-identity > /dev/null 2>&1; then
  if [[ -f "$PROJECT_ROOT/credentials" ]]; then
    export AWS_SHARED_CREDENTIALS_FILE="$PROJECT_ROOT/credentials"
    echo "Using project credentials file"
  else
    echo "ERROR: AWS credentials not configured. Run 'aws configure' or place credentials file in project root."
    exit 1
  fi
fi

echo "--- Creating S3 buckets (if needed) ---"
aws s3 mb "s3://${TEMPLATES_BUCKET}" --region "$AWS_REGION" 2>/dev/null || true
aws s3 mb "s3://${LAMBDA_S3_BUCKET}" --region "$AWS_REGION" 2>/dev/null || true

echo "--- Uploading CFn templates ---"
aws s3 sync "$CFN_DIR" "s3://${TEMPLATES_BUCKET}/cfn/" \
  --region "$AWS_REGION" \
  --exclude "*.md"

echo "--- Building Lambda package ---"
cd "$PROJECT_ROOT"
npm ci
npm run build
# Re-install without devDependencies for smaller Lambda package
npm ci --omit=dev
zip -r /tmp/lambda-deployment.zip dist/ node_modules/ package.json 2>/dev/null || \
  python3 -c "
import zipfile, os
with zipfile.ZipFile('/tmp/lambda-deployment.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for folder in ['dist', 'node_modules']:
        for root, dirs, files in os.walk(folder):
            for f in files:
                fp = os.path.join(root, f)
                zf.write(fp)
    zf.write('package.json')
print('Created lambda-deployment.zip via python3 zipfile')
"

echo "--- Uploading Lambda package ---"
aws s3 cp /tmp/lambda-deployment.zip "s3://${LAMBDA_S3_BUCKET}/${LAMBDA_S3_KEY}" \
  --region "$AWS_REGION"

echo "--- Deploying CloudFormation stack: ${STACK_NAME} ---"
aws cloudformation deploy \
  --template-file "$CFN_DIR/main.yml" \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
  --parameter-overrides \
    "Environment=${ENV}" \
    "TemplatesBucket=${TEMPLATES_BUCKET}" \
    "LambdaS3Bucket=${LAMBDA_S3_BUCKET}" \
    "LambdaS3Key=${LAMBDA_S3_KEY}" \
    "GitHubToken=${GITHUB_TOKEN}" \
    "MaxLeverage=${MAX_LEVERAGE:-1}" \
    "EnableShortSelling=${ENABLE_SHORT_SELLING:-false}" \
    ${GITHUB_MODEL_ID:+"GitHubModelId=${GITHUB_MODEL_ID}"} \
  --tags \
    "Project=ai-invest" \
    "Environment=${ENV}" \
  --no-fail-on-empty-changeset

echo "--- Stack outputs ---"
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query "Stacks[0].Outputs" \
  --output table

echo "=== Deploy complete [${ENV}] ==="
