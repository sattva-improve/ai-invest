# AWS Setup Guide

This guide covers deploying the AI-powered multi-market trading bot to AWS Lambda with supporting services.
Supported markets: 🇯🇵 Japanese stocks (TSE), 🇺🇸 US stocks (NYSE/NASDAQ), 🇨🇳 Chinese stocks (HKEX / Shanghai / Shenzhen).

## 1. Prerequisites

- **AWS CLI v2** installed and configured (`aws configure`)
- **IAM User/Role** with permissions for: Lambda, DynamoDB, SSM, EventBridge, Step Functions, CloudWatch Logs
- **Node.js v22** (for local builds)
- **GitHub repository** with Actions enabled (for CI/CD)

```bash
# Verify AWS CLI
aws --version
aws sts get-caller-identity
```

## 2. DynamoDB Setup

Create the single-table `InvestmentTable` with a GSI for type-based queries.

```bash
# Create the main table
aws dynamodb create-table \
  --table-name InvestmentTable \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=type,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes \
    '[{
      "IndexName": "TypeIndex",
      "KeySchema": [{"AttributeName":"type","KeyType":"HASH"},{"AttributeName":"SK","KeyType":"RANGE"}],
      "Projection": {"ProjectionType":"ALL"},
      "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
    }]' \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --region ap-northeast-1

# Verify
aws dynamodb describe-table --table-name InvestmentTable --query "Table.TableStatus"
```

### Table Schema

| Entity | PK | SK | Description |
|--------|----|----|-------------|
| NEWS_ITEM | `NEWS#JP\|US\|CN` | `TIMESTAMP#UUID` | Analyzed news articles with sentiment, per market |
| TRADE_ITEM | `TRADE#JP\|US\|CN` | `TIMESTAMP#ORDER_ID` | Executed trades with P&L, per market |
| BALANCE_ITEM | `BALANCE#JP\|US\|CN` | `LATEST` | Cash balance per market (original currency + JPY) |
| STATE_ITEM | `STATE` | `{market}#LATEST` | Last run time and status per market |
| PRICE_ITEM | `PRICE#{ticker}` | `TIMESTAMP` | OHLCV price data by ticker |
## 3. SSM Parameter Store

Store all sensitive credentials in SSM Parameter Store as `SecureString`. **Never hardcode API keys.**

```bash
# ── AI (GitHub Copilot Models API) ────────────────────────────────
# Uses GitHub Personal Access Token for authentication.
# Store the token in SSM Parameter Store:
aws ssm put-parameter \
  --name "/algo-trade/GITHUB_TOKEN" \
  --value "ghp_YOUR_GITHUB_PERSONAL_ACCESS_TOKEN" \
  --type SecureString \
  --region ap-northeast-1

# Optionally store the model ID (default: openai/gpt-4.1):
aws ssm put-parameter \
  --name "/algo-trade/GITHUB_MODEL_ID" \
  --value "openai/gpt-4.1" \
  --type String \
  --region ap-northeast-1

# ── Japanese Stocks (JP) ─────────────────────────────────────────
# au Kabucom API
aws ssm put-parameter \
  --name "/algo-trade/KABUCOM_API_PASSWORD" \
  --value "YOUR_PASSWORD" \
  --type SecureString \
  --region ap-northeast-1

aws ssm put-parameter \
  --name "/algo-trade/KABUCOM_ACCOUNT_PASSWORD" \
  --value "YOUR_ACCOUNT_PASSWORD" \
  --type SecureString \
  --region ap-northeast-1

# ── US Stocks (US) ───────────────────────────────────────────────
# Interactive Brokers (Client Portal API / TWS)
aws ssm put-parameter \
  --name "/algo-trade/IBKR_ACCOUNT_ID" \
  --value "YOUR_ACCOUNT_ID" \
  --type SecureString \
  --region ap-northeast-1

# Alpaca (paper trade only for non-US residents)
aws ssm put-parameter \
  --name "/algo-trade/ALPACA_API_KEY" \
  --value "YOUR_KEY" \
  --type SecureString \
  --region ap-northeast-1

aws ssm put-parameter \
  --name "/algo-trade/ALPACA_SECRET_KEY" \
  --value "YOUR_SECRET" \
  --type SecureString \
  --region ap-northeast-1

# ── Chinese Stocks (CN) ──────────────────────────────────────────
# Futu OpenAPI (Moomoo) — FutuOpenD daemon host/port
aws ssm put-parameter \
  --name "/algo-trade/FUTU_HOST" \
  --value "127.0.0.1" \
  --type String \
  --region ap-northeast-1

aws ssm put-parameter \
  --name "/algo-trade/FUTU_PORT" \
  --value "11111" \
  --type String \
  --region ap-northeast-1

# ── Crypto (legacy) ──────────────────────────────────────────────
aws ssm put-parameter \
  --name "/algo-trade/EXCHANGE_API_KEY" \
  --value "YOUR_KEY" \
  --type SecureString \
  --region ap-northeast-1

aws ssm put-parameter \
  --name "/algo-trade/EXCHANGE_SECRET" \
  --value "YOUR_SECRET" \
  --type SecureString \
  --region ap-northeast-1

# Verify
aws ssm get-parameters-by-path --path "/algo-trade/" --query "Parameters[].Name"
```

## 4. Lambda Functions

### 4.1 IAM Role

Create an execution role for all Lambda functions:

```bash
# Create the role
aws iam create-role \
  --role-name algo-trade-lambda-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach policies
aws iam attach-role-policy \
  --role-name algo-trade-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# Inline policy for DynamoDB + SSM access
aws iam put-role-policy \
  --role-name algo-trade-lambda-role \
  --policy-name algo-trade-permissions \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:Query","dynamodb:Scan"],
        "Resource": "arn:aws:dynamodb:*:*:table/InvestmentTable*"
      },
      {
        "Effect": "Allow",
        "Action": ["ssm:GetParameter","ssm:GetParameters"],
        "Resource": "arn:aws:ssm:*:*:parameter/algo-trade/*"
      }
    ]
  }'
```

### 4.2 Create Functions

Build and deploy the Lambda package, then create functions for each pipeline stage and market:

```bash
# Build the project
npm ci --omit=dev
npm run build
zip -r lambda-deployment.zip dist/ node_modules/ package.json

# ── Shared pipeline functions ────────────────────────────────────
# fetch-news: fetches RSS feeds for all markets
aws lambda create-function \
  --function-name algo-trade-fetch-news \
  --runtime nodejs22.x \
  --handler dist/handlers/fetch-news.handler \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/algo-trade-lambda-role \
  --zip-file fileb://lambda-deployment.zip \
  --timeout 60 \
  --memory-size 256 \
  --region ap-northeast-1

# fetch-price: OHLCV data via yahoo-finance2 / J-Quants
aws lambda create-function \
  --function-name algo-trade-fetch-price \
  --runtime nodejs22.x \
  --handler dist/handlers/fetch-price.handler \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/algo-trade-lambda-role \
  --zip-file fileb://lambda-deployment.zip \
  --timeout 30 \
  --memory-size 256 \
  --region ap-northeast-1

# analyze: AI analysis (GitHub Copilot Models API) + market routing
aws lambda create-function \
  --function-name algo-trade-analyze \
  --runtime nodejs22.x \
  --handler dist/handlers/analyze.handler \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/algo-trade-lambda-role \
  --zip-file fileb://lambda-deployment.zip \
  --timeout 120 \
  --memory-size 512 \
  --region ap-northeast-1

# ── Market-specific trade execution ───────────────────────────────
# trade-jp: Japanese stocks — au Kabucom API / IBKR
aws lambda create-function \
  --function-name algo-trade-trade-jp \
  --runtime nodejs22.x \
  --handler dist/handlers/trade-jp.handler \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/algo-trade-lambda-role \
  --zip-file fileb://lambda-deployment.zip \
  --timeout 30 \
  --memory-size 256 \
  --region ap-northeast-1

# trade-us: US stocks — IBKR Client Portal API / Alpaca (paper)
aws lambda create-function \
  --function-name algo-trade-trade-us \
  --runtime nodejs22.x \
  --handler dist/handlers/trade-us.handler \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/algo-trade-lambda-role \
  --zip-file fileb://lambda-deployment.zip \
  --timeout 30 \
  --memory-size 256 \
  --region ap-northeast-1

# trade-cn: Chinese stocks — Futu OpenAPI / IBKR
aws lambda create-function \
  --function-name algo-trade-trade-cn \
  --runtime nodejs22.x \
  --handler dist/handlers/trade-cn.handler \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/algo-trade-lambda-role \
  --zip-file fileb://lambda-deployment.zip \
  --timeout 30 \
  --memory-size 256 \
  --region ap-northeast-1
```

## 5. EventBridge Rules

Schedule pipeline triggers with market-hour-aware EventBridge rules. Each market runs on its own schedule to align with trading hours (all times in UTC, converted from JST).

```bash
# ── 🇯🇵 Japanese Market (TSE) ────────────────────────────────────
# TSE opens 09:00 JST = 00:00 UTC (no DST in Japan)
aws events put-rule \
  --name algo-trade-jp-market-open \
  --schedule-expression "cron(0 0 ? * MON-FRI *)" \
  --state ENABLED \
  --description "JP market open trigger (TSE 09:00 JST)" \
  --region ap-northeast-1

aws events put-targets \
  --rule algo-trade-jp-market-open \
  --targets 'Id=fetch-news-jp,Arn=arn:aws:lambda:ap-northeast-1:YOUR_ACCOUNT_ID:function:algo-trade-fetch-news,Input={"market":"JP"}' \
  --region ap-northeast-1

aws lambda add-permission \
  --function-name algo-trade-fetch-news \
  --statement-id eventbridge-invoke-jp \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:ap-northeast-1:YOUR_ACCOUNT_ID:rule/algo-trade-jp-market-open

# ── 🇺🇸 US Market (NYSE/NASDAQ) ──────────────────────────────────
# NYSE opens 09:30 ET = 14:30 UTC (standard time) = 23:30 JST
# Summer (DST): 13:30 UTC = 22:30 JST  — adjust cron seasonally or use a Lambda pre-check
aws events put-rule \
  --name algo-trade-us-market-open \
  --schedule-expression "cron(30 14 ? * MON-FRI *)" \
  --state ENABLED \
  --description "US market open trigger (NYSE 09:30 ET / 14:30 UTC standard)" \
  --region ap-northeast-1

aws events put-targets \
  --rule algo-trade-us-market-open \
  --targets 'Id=fetch-news-us,Arn=arn:aws:lambda:ap-northeast-1:YOUR_ACCOUNT_ID:function:algo-trade-fetch-news,Input={"market":"US"}' \
  --region ap-northeast-1

aws lambda add-permission \
  --function-name algo-trade-fetch-news \
  --statement-id eventbridge-invoke-us \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:ap-northeast-1:YOUR_ACCOUNT_ID:rule/algo-trade-us-market-open

# ── 🇨🇳 Chinese Market (SSE/SZSE) + 🇭🇰 HKEX ────────────────────
# SSE/SZSE open 09:30 CST = 01:30 UTC = 10:30 JST
# HKEX opens 09:30 HKT = 01:30 UTC = 10:30 JST (both on UTC+8)
aws events put-rule \
  --name algo-trade-cn-market-open \
  --schedule-expression "cron(30 1 ? * MON-FRI *)" \
  --state ENABLED \
  --description "CN/HK market open trigger (SSE/HKEX 09:30 / 01:30 UTC)" \
  --region ap-northeast-1

aws events put-targets \
  --rule algo-trade-cn-market-open \
  --targets 'Id=fetch-news-cn,Arn=arn:aws:lambda:ap-northeast-1:YOUR_ACCOUNT_ID:function:algo-trade-fetch-news,Input={"market":"CN"}' \
  --region ap-northeast-1

aws lambda add-permission \
  --function-name algo-trade-fetch-news \
  --statement-id eventbridge-invoke-cn \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:ap-northeast-1:YOUR_ACCOUNT_ID:rule/algo-trade-cn-market-open
```

## 6. Step Functions

Create a state machine that orchestrates the full multi-market pipeline:
`fetch-news` → `fetch-price` → `analyze` (AI) → if confidence > 0.8 → Market Router → `trade-jp` | `trade-us` | `trade-cn`

```bash
aws stepfunctions create-state-machine \
  --name algo-trade-pipeline \
  --definition '{
    "Comment": "Multi-market AI Trading Pipeline: Fetch -> Analyze -> Route -> Trade",
    "StartAt": "FetchNews",
    "States": {
      "FetchNews": {
        "Type": "Task",
        "Resource": "arn:aws:lambda:ap-northeast-1:YOUR_ACCOUNT_ID:function:algo-trade-fetch-news",
        "Next": "FetchPrice",
        "Catch": [{"ErrorEquals": ["States.ALL"], "Next": "HandleError"}]
      },
      "FetchPrice": {
        "Type": "Task",
        "Resource": "arn:aws:lambda:ap-northeast-1:YOUR_ACCOUNT_ID:function:algo-trade-fetch-price",
        "Next": "Analyze",
        "Catch": [{"ErrorEquals": ["States.ALL"], "Next": "HandleError"}]
      },
      "Analyze": {
        "Type": "Task",
        "Resource": "arn:aws:lambda:ap-northeast-1:YOUR_ACCOUNT_ID:function:algo-trade-analyze",
        "Next": "CheckHighConfidence",
        "Catch": [{"ErrorEquals": ["States.ALL"], "Next": "HandleError"}]
      },
      "CheckHighConfidence": {
        "Type": "Choice",
        "Choices": [{
          "Variable": "$.confidence",
          "NumericGreaterThan": 0.8,
          "Next": "RouteByMarket"
        }],
        "Default": "Done"
      },
      "RouteByMarket": {
        "Type": "Choice",
        "Choices": [
          {"Variable": "$.market", "StringEquals": "JP", "Next": "TradeJP"},
          {"Variable": "$.market", "StringEquals": "US", "Next": "TradeUS"},
          {"Variable": "$.market", "StringEquals": "CN", "Next": "TradeCN"}
        ],
        "Default": "Done"
      },
      "TradeJP": {
        "Type": "Task",
        "Resource": "arn:aws:lambda:ap-northeast-1:YOUR_ACCOUNT_ID:function:algo-trade-trade-jp",
        "Next": "Done",
        "Catch": [{"ErrorEquals": ["States.ALL"], "Next": "HandleError"}]
      },
      "TradeUS": {
        "Type": "Task",
        "Resource": "arn:aws:lambda:ap-northeast-1:YOUR_ACCOUNT_ID:function:algo-trade-trade-us",
        "Next": "Done",
        "Catch": [{"ErrorEquals": ["States.ALL"], "Next": "HandleError"}]
      },
      "TradeCN": {
        "Type": "Task",
        "Resource": "arn:aws:lambda:ap-northeast-1:YOUR_ACCOUNT_ID:function:algo-trade-trade-cn",
        "Next": "Done",
        "Catch": [{"ErrorEquals": ["States.ALL"], "Next": "HandleError"}]
      },
      "HandleError": {
        "Type": "Fail",
        "Error": "PipelineError",
        "Cause": "An error occurred in the trading pipeline"
      },
      "Done": {
        "Type": "Succeed"
      }
    }
  }' \
  --role-arn arn:aws:iam::YOUR_ACCOUNT_ID:role/algo-trade-stepfunctions-role \
  --region ap-northeast-1
```

> **Note:** Create a separate IAM role for Step Functions with `lambda:InvokeFunction` permission on all six Lambda functions.

## 7. ElastiCache (Redis) — Optional

For Lambda environments, replace local Redis with ElastiCache. This is optional — the bot works without Redis caching.

```bash
# Create a Redis cluster (single-node for cost savings)
aws elasticache create-cache-cluster \
  --cache-cluster-id algo-trade-cache \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --num-cache-nodes 1 \
  --region ap-northeast-1
```

> **Important:** Lambda functions must run inside a VPC to access ElastiCache. Configure VPC, subnets, and security groups accordingly.

## 8. Environment Variables

Configure these environment variables on each Lambda function. Market-specific trade functions only need their market's broker credentials.

| Variable | Description | Source | Functions |
|----------|-------------|--------|-----------|
| `NODE_ENV` | `production` | Direct | All |
| `DYNAMODB_TABLE_NAME` | `InvestmentTable` | Direct | All |
| `DYNAMODB_REGION` | `ap-northeast-1` | Direct | All |
| `GITHUB_TOKEN` | GitHub Personal Access Token (`models:read` スコープ) | SSM | `analyze` |
| `GITHUB_MODEL_ID` | AI モデル ID (default: `openai/gpt-4.1`) | Direct | `analyze` |
| `CONFIDENCE_THRESHOLD` | `0.8` | Direct | `analyze` |
| `KABUCOM_API_PASSWORD` | au Kabucom API password | SSM | `trade-jp` |
| `KABUCOM_ACCOUNT_PASSWORD` | au Kabucom order password | SSM | `trade-jp` |
| `IBKR_ACCOUNT_ID` | IBKR account ID | SSM | `trade-us`, `trade-jp` |
| `ALPACA_API_KEY` | Alpaca paper key | SSM | `trade-us` |
| `ALPACA_SECRET_KEY` | Alpaca paper secret | SSM | `trade-us` |
| `FUTU_HOST` | FutuOpenD host | SSM | `trade-cn` |
| `FUTU_PORT` | FutuOpenD port | SSM | `trade-cn` |
| `PAPER_TRADE` | `true` (always start with paper trading) | Direct | All trade |
| `EXCHANGE_API_KEY` | Crypto exchange key (legacy) | SSM | `trade-crypto` |
| `EXCHANGE_SECRET` | Crypto exchange secret (legacy) | SSM | `trade-crypto` |
| `EXCHANGE_ID` | `binance` (legacy) | Direct | `trade-crypto` |
| `REDIS_URL` | ElastiCache endpoint (optional) | Direct | All |
| `LOG_LEVEL` | `info` | Direct | All |
```bash
# Example: Set environment variables on a Lambda function
aws lambda update-function-configuration \
  --function-name algo-trade-fetch-news \
  --environment "Variables={
    NODE_ENV=production,
    DYNAMODB_TABLE_NAME=InvestmentTable,
    DYNAMODB_REGION=ap-northeast-1,
    EXCHANGE_ID=binance,
    PAPER_TRADE=true,
    CONFIDENCE_THRESHOLD=0.8,
    LOG_LEVEL=info
  }" \
  --region ap-northeast-1
```

> **Tip:** For API keys, use the [AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html) to fetch SSM parameters at runtime instead of setting them as environment variables.
