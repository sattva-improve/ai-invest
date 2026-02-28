# AWS Migration Guide

ローカル（Docker）で検証済みのシステムを AWS Serverless 環境へ移行するためのガイドです。

> **前提**: `docs/deployment/aws-setup.md` に記載の AWS リソース作成が完了していること。

---

## 目次

1. [移行の全体像](#1-移行の全体像)
2. [移行前チェックリスト](#2-移行前チェックリスト)
3. [アーキテクチャの差分](#3-アーキテクチャの差分)
4. [ステップバイステップ移行手順](#4-ステップバイステップ移行手順)
5. [動作検証手順](#5-動作検証手順)
6. [本番切り替え](#6-本番切り替え)
7. [ロールバック手順](#7-ロールバック手順)
8. [トラブルシューティング](#8-トラブルシューティング)
9. [コスト見積もり](#9-コスト見積もり)

---

## 1. 移行の全体像

```
[ローカル環境]                    [AWS 環境]
Ubuntu Server (Docker)    →      Serverless
  BullMQ (Redis Cron)     →      EventBridge Scheduler
  DynamoDB Local          →      DynamoDB (ap-northeast-1)
  Long-running Process    →      Lambda Functions
  Redis (local)           →      ElastiCache (任意) / なし
  .env ファイル            →      SSM Parameter Store
```

### 移行方針

| 移行方針 | 詳細 |
|----------|------|
| **無停止** | ローカルを動かしたまま AWS を構築・検証し、確認後に切り替える |
| **ペーパートレードで開始** | 最初は `PAPER_TRADE=true` で実行し、確認後に `false` へ切り替える |
| **段階的移行** | 全機能を一度に移行せず、Fetch → Analyze → Trade の順で動作確認 |

---

## 2. 移行前チェックリスト

### 2.1 ローカル検証の完了確認

```bash
# 全テストが通ること
npm test

# Lint・型チェックがクリーンなこと
npm run lint
npm run build

# ローカルで正常に動作していること（直近のログ確認）
docker compose logs -f
```

- [ ] `npm test` — すべて PASS
- [ ] `npm run lint` — エラーなし
- [ ] `npm run build` — ビルド成功
- [ ] DynamoDB Local にデータが正常に書き込まれている
- [ ] AI 分析 (Gemini API) の呼び出しが正常に完了している
- [ ] ペーパートレードが意図した通りに動作している

### 2.2 AWS 側の準備確認

```bash
# AWS CLI の認証確認
aws sts get-caller-identity

# DynamoDB テーブルが存在するか
aws dynamodb describe-table --table-name InvestmentTable --query "Table.TableStatus" --region ap-northeast-1

# SSM パラメータが設定済みか
aws ssm get-parameters-by-path --path "/algo-trade/" --query "Parameters[].Name" --region ap-northeast-1

# Lambda 関数が存在するか
aws lambda list-functions --query "Functions[?starts_with(FunctionName, 'algo-trade')].FunctionName" --region ap-northeast-1
```

- [ ] AWS CLI 認証済み（正しいアカウント・リージョン）
- [ ] `InvestmentTable` が DynamoDB に存在する
- [ ] SSM に3つのパラメータが設定されている（`GOOGLE_GENERATIVE_AI_API_KEY`, `EXCHANGE_API_KEY`, `EXCHANGE_SECRET`）
- [ ] Lambda 関数 3 つが作成されている（`algo-trade-fetch-news`, `algo-trade-fetch-price`, `algo-trade-execute-trade`）
- [ ] IAM ロール `algo-trade-lambda-role` が存在し、DynamoDB / SSM 権限が付与されている

### 2.3 コード側の確認

- [ ] `src/handlers/` に Lambda エントリポイントが実装されている
- [ ] `src/config/env.ts` が `DYNAMODB_ENDPOINT` 未設定時に AWS DynamoDB に接続する分岐になっている
- [ ] ハードコードされた `localhost` 参照がない

```bash
# localhost / 127.0.0.1 の参照チェック
grep -r "localhost\|127\.0\.0\.1" src/ --include="*.ts" | grep -v ".test.ts" | grep -v ".spec.ts"
```

---

## 3. アーキテクチャの差分

### 3.1 コンポーネント対応表

| ローカル | AWS | 変更内容 |
|----------|-----|----------|
| BullMQ + Redis (Cron) | EventBridge Scheduler | スケジュール定義を EventBridge へ移管 |
| Long-running Node.js プロセス | Lambda Functions | ハンドラー関数として実行 |
| DynamoDB Local (`localhost:8000`) | DynamoDB (ap-northeast-1) | エンドポイントを削除するだけ |
| `.env` ファイル | SSM Parameter Store + Lambda 環境変数 | 機密値は SSM、非機密値は env |
| Redis (BullMQ キュー) | 不要（Lambda は都度起動） | BullMQ は削除 / 無効化 |
| Redis (キャッシュ) | ElastiCache (任意) または廃止 | Lambda はステートレスのためキャッシュ効果が限定的 |
| pino ログ → stdout | pino ログ → CloudWatch Logs | 変更なし（pino の stdout が自動で CloudWatch に流れる） |

### 3.2 コード変更が不要な理由

このプロジェクトは **ハンドラーパターン + リポジトリパターン** で設計されているため、以下は**変更なし**で動作します：

- `src/services/` — ビジネスロジック（変更なし）
- `src/repositories/` — DynamoDB アクセス（エンドポイントが環境変数で切り替わる）
- `src/providers/` — 外部データ取得（変更なし）
- `src/schemas/` — Zod スキーマ（変更なし）

**変更が必要なのは設定・インフラ層のみ。**

### 3.3 環境変数の差分

| 変数 | ローカル (`.env`) | AWS (Lambda 環境変数) |
|------|-------------------|----------------------|
| `DYNAMODB_ENDPOINT` | `http://localhost:8000` | **設定しない**（削除） |
| `DYNAMODB_REGION` | `ap-northeast-1` | `ap-northeast-1` |
| `DYNAMODB_TABLE_NAME` | `InvestmentTable` | `InvestmentTable` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `.env` に直接記載 | SSM から自動取得 |
| `EXCHANGE_API_KEY` | `.env` に直接記載 | SSM から自動取得 |
| `EXCHANGE_SECRET` | `.env` に直接記載 | SSM から自動取得 |
| `NODE_ENV` | `development` | `production` |
| `PAPER_TRADE` | `true` or `false` | `true`（移行直後） |
| `REDIS_URL` | `redis://localhost:6379` | **設定しない** または ElastiCache URL |

---

## 4. ステップバイステップ移行手順

### Step 1: ビルド & デプロイパッケージ作成

```bash
# 依存関係インストール（dev 除外）
npm ci --omit=dev

# TypeScript ビルド
npm run build

# Lambda デプロイパッケージ作成
zip -r lambda-deployment.zip dist/ node_modules/ package.json

# ファイルサイズ確認（50MB 以下推奨）
ls -lh lambda-deployment.zip
```

> **注意**: `node_modules` が大きい場合は Lambda Layer を検討してください。  
> 250MB（展開後）を超える場合は `--layers` オプションで分離が必要です。

### Step 2: Lambda 関数のコードを更新

```bash
# fetch-news 関数を更新
aws lambda update-function-code \
  --function-name algo-trade-fetch-news \
  --zip-file fileb://lambda-deployment.zip \
  --region ap-northeast-1

# fetch-price 関数を更新
aws lambda update-function-code \
  --function-name algo-trade-fetch-price \
  --zip-file fileb://lambda-deployment.zip \
  --region ap-northeast-1

# execute-trade 関数を更新
aws lambda update-function-code \
  --function-name algo-trade-execute-trade \
  --zip-file fileb://lambda-deployment.zip \
  --region ap-northeast-1
```

### Step 3: 環境変数を Lambda に設定

```bash
# 非機密値を直接設定（3関数それぞれに実行）
for FUNC in algo-trade-fetch-news algo-trade-fetch-price algo-trade-execute-trade; do
  aws lambda update-function-configuration \
    --function-name "$FUNC" \
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
done
```

> **機密値（APIキー）** は SSM Parameter Store に格納済みのため、Lambda 環境変数には設定不要です。  
> Lambda 実行時にコードから `aws ssm get-parameter` で取得します。

### Step 4: SSM パラメータ取得の動作確認

Lambda に SSM へのアクセス権があるか、テスト実行で確認します：

```bash
# fetch-news を手動でテスト実行（ペイロードなし）
aws lambda invoke \
  --function-name algo-trade-fetch-news \
  --payload '{}' \
  --cli-binary-format raw-in-base64-out \
  response.json \
  --region ap-northeast-1

# レスポンス確認
cat response.json
```

`FunctionError` フィールドがなければ成功です。

### Step 5: DynamoDB への書き込み確認

```bash
# 最新の NEWS_ITEM を確認
aws dynamodb query \
  --table-name InvestmentTable \
  --key-condition-expression "PK = :pk" \
  --expression-attribute-values '{":pk": {"S": "NEWS"}}' \
  --scan-index-forward false \
  --limit 5 \
  --region ap-northeast-1
```

### Step 6: Step Functions パイプライン確認

```bash
# Step Functions の実行を手動でトリガー
aws stepfunctions start-execution \
  --state-machine-arn arn:aws:states:ap-northeast-1:YOUR_ACCOUNT_ID:stateMachine:algo-trade-pipeline \
  --region ap-northeast-1

# 実行結果を確認
aws stepfunctions list-executions \
  --state-machine-arn arn:aws:states:ap-northeast-1:YOUR_ACCOUNT_ID:stateMachine:algo-trade-pipeline \
  --max-results 1 \
  --region ap-northeast-1
```

### Step 7: CloudWatch Logs で実行ログ確認

```bash
# 直近の fetch-news のログを取得
aws logs tail /aws/lambda/algo-trade-fetch-news --since 10m --region ap-northeast-1

# エラーフィルタリング
aws logs filter-log-events \
  --log-group-name /aws/lambda/algo-trade-fetch-news \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --region ap-northeast-1
```

### Step 8: EventBridge スケジュールの有効化

すべての確認が完了したら、EventBridge ルールを有効化します：

```bash
# ニュース取得スケジュール（毎時）を有効化
aws events enable-rule \
  --name algo-trade-fetch-news-schedule \
  --region ap-northeast-1

# 価格取得スケジュール（5分毎）を有効化
aws events enable-rule \
  --name algo-trade-fetch-price-schedule \
  --region ap-northeast-1
```

---

## 5. 動作検証手順

### 5.1 ペーパートレードで 24 時間監視

移行直後は必ず `PAPER_TRADE=true` のまま最低 24 時間運用し、以下を確認します：

```bash
# CloudWatch でエラー率を監視
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=algo-trade-fetch-news \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 3600 \
  --statistics Sum \
  --region ap-northeast-1
```

#### 確認項目

| 項目 | 確認方法 | 合格基準 |
|------|----------|----------|
| Lambda エラー率 | CloudWatch Metrics | 0% |
| DynamoDB 書き込み | `aws dynamodb query ...` | 定期的にレコードが増えている |
| AI 分析結果 | DynamoDB の NEWS_ITEM | `sentiment` フィールドが正常な値 |
| Step Functions 成功率 | コンソール / CLI | `SUCCEEDED` 状態 |
| Lambda 実行時間 | CloudWatch Metrics | タイムアウト (60s / 30s) の80%未満 |
| Lambda メモリ使用量 | CloudWatch Logs Insights | 設定値 (256MB) の80%未満 |

### 5.2 CloudWatch Logs Insights クエリ例

```
# エラーログの集計
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 50
```

```
# Lambda 実行時間の分布
filter @type = "REPORT"
| stats avg(@duration), max(@duration), min(@duration) by bin(1h)
```

---

## 6. 本番切り替え

### 6.1 ペーパートレードから実取引へ

24 時間の検証が問題なく完了したら、実取引に切り替えます：

```bash
# PAPER_TRADE を false に変更
for FUNC in algo-trade-fetch-news algo-trade-fetch-price algo-trade-execute-trade; do
  aws lambda update-function-configuration \
    --function-name "$FUNC" \
    --environment "Variables={
      NODE_ENV=production,
      DYNAMODB_TABLE_NAME=InvestmentTable,
      DYNAMODB_REGION=ap-northeast-1,
      EXCHANGE_ID=binance,
      PAPER_TRADE=false,
      CONFIDENCE_THRESHOLD=0.8,
      LOG_LEVEL=info
    }" \
    --region ap-northeast-1
done
```

> **重要**: 実取引切り替え後は必ず取引所の残高・注文を直接確認してください。

### 6.2 ローカル環境の停止

AWS で正常動作を確認後、ローカルのスケジューラーを停止して二重実行を防ぎます：

```bash
# ローカルの Docker 停止
docker compose down
```

---

## 7. ロールバック手順

問題が発生した場合、以下の手順で即座にロールバックします。

### 7.1 即時停止（EventBridge を無効化）

```bash
# スケジュールをすべて停止（新規トリガーをブロック）
aws events disable-rule --name algo-trade-fetch-news-schedule --region ap-northeast-1
aws events disable-rule --name algo-trade-fetch-price-schedule --region ap-northeast-1
```

### 7.2 ローカル環境を再起動

```bash
# ローカル環境を再開
docker compose up -d
npm run dev
```

### 7.3 Lambda を以前のバージョンに戻す（コード起因の場合）

```bash
# Lambda のバージョン一覧を確認
aws lambda list-versions-by-function \
  --function-name algo-trade-fetch-news \
  --region ap-northeast-1

# 特定バージョンに戻す場合（エイリアスを使用している場合）
aws lambda update-alias \
  --function-name algo-trade-fetch-news \
  --name production \
  --function-version 1 \
  --region ap-northeast-1
```

### 7.4 ロールバック判断基準

以下のいずれかが発生した場合は即座にロールバック：

- Lambda エラー率が 5% を超えた
- 予期しない注文が発注された（取引所で確認）
- DynamoDB への書き込みが 2 サイクル以上停止した
- Step Functions の実行が `FAILED` 状態で 3 回連続発生

---

## 8. トラブルシューティング

### Lambda タイムアウト

**症状**: CloudWatch に `Task timed out after X.XX seconds` が出る  
**対処**:

```bash
# タイムアウト値を延長（fetch-news: 最大 60 秒 → 120 秒）
aws lambda update-function-configuration \
  --function-name algo-trade-fetch-news \
  --timeout 120 \
  --region ap-northeast-1
```

### DynamoDB アクセス拒否

**症状**: `AccessDeniedException: User is not authorized to perform: dynamodb:PutItem`  
**対処**: IAM ロールのインラインポリシーを確認・修正

```bash
# 現在のポリシーを確認
aws iam get-role-policy \
  --role-name algo-trade-lambda-role \
  --policy-name algo-trade-permissions
```

### SSM パラメータ取得失敗

**症状**: `ParameterNotFound` または `AccessDeniedException`  
**対処**:

```bash
# パラメータの存在確認
aws ssm get-parameter \
  --name "/algo-trade/GOOGLE_GENERATIVE_AI_API_KEY" \
  --with-decryption \
  --region ap-northeast-1

# IAM ポリシーで ssm:GetParameter が許可されているか確認
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::YOUR_ACCOUNT_ID:role/algo-trade-lambda-role \
  --action-names "ssm:GetParameter" \
  --resource-arns "arn:aws:ssm:ap-northeast-1:YOUR_ACCOUNT_ID:parameter/algo-trade/*"
```

### Lambda メモリ不足

**症状**: `Runtime exited with error: signal: killed`  
**対処**:

```bash
# メモリを 512MB に増加
aws lambda update-function-configuration \
  --function-name algo-trade-fetch-news \
  --memory-size 512 \
  --region ap-northeast-1
```

### Gemini API レート制限

**症状**: `429 Too Many Requests` が CloudWatch に出る  
**対処**: Lambda の同時実行数を制限するか、exponential backoff をコードに実装する

```bash
# Lambda の同時実行数を制限（同時に最大 2 実行まで）
aws lambda put-function-concurrency \
  --function-name algo-trade-fetch-news \
  --reserved-concurrent-executions 2 \
  --region ap-northeast-1
```

---

## 9. コスト見積もり

> リージョン: `ap-northeast-1` (東京)、料金は 2025 年時点の概算

| サービス | 想定使用量 | 月額概算 |
|----------|------------|----------|
| Lambda (fetch-news) | 720 回/月 (毎時 × 30 日)、256MB、60s | ~$0.02 |
| Lambda (fetch-price) | 8,640 回/月 (5分毎 × 30 日)、256MB、30s | ~$0.11 |
| Lambda (execute-trade) | 条件付き実行、256MB、30s | ~$0.01 以下 |
| DynamoDB | オンデマンド、~10,000 書き込み/月 | ~$0.13 |
| Step Functions | 1,440 実行/月 (毎時) | ~$0.04 |
| EventBridge | 1 ルール | ~$0.00 (無料枠内) |
| CloudWatch Logs | ~1 GB/月 | ~$0.76 |
| SSM Parameter Store | 3 パラメータ (SecureString) | ~$0.00 (無料枠内) |
| **合計** | | **~$1/月** |

> ElastiCache を追加する場合は `cache.t3.micro` で +$12〜15/月。

---

## 関連ドキュメント

- [AWS セットアップ手順](./aws-setup.md) — AWS リソースの作成コマンド集
- [ローカル開発環境構築](../runbook/local-development.md) — ローカル環境のセットアップ
- [システム構成図 (Local)](../architecture/system-overview.mmd) — ローカルアーキテクチャ
- [システム構成図 (AWS Target)](../architecture/future-system-overview.mmd) — AWS ターゲットアーキテクチャ
- [データフロー図](../architecture/process-flow.mmd) — 処理フロー
- [DynamoDB スキーマ](../database/schema.mmd) — テーブル設計
