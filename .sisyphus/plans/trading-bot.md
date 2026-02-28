# AI-Powered Algorithmic Trading Bot — 全フェーズ作業プラン

**作成日:** 2026-02-28  
**方針:** 動くプロトタイプ優先 → テストカバレッジで品質担保  
**対象資産:** 暗号資産 + 株式・ETF（両方）  
**AIモデル:** Gemini 2.5 Pro（重要判断）+ Gemini 2.0 Flash（高頻度分析）2モデル構成

---

## Phase 1: 環境構築

### 1-1: プロジェクト基盤セットアップ
- [x] `package.json` 作成 — TypeScript 5.x, Node.js v22, 全依存パッケージ定義（`ai`, `@ai-sdk/google`, `zod`, `@aws-sdk/client-dynamodb`, `ioredis`, `bullmq`, `ccxt`, `yahoo-finance2`, `pino`, `rss-parser`, `dotenv`）
- [x] `tsconfig.json` 作成 — strict mode, Node.js v22ターゲット, `src/` → `dist/` パス設定
- [x] `biome.json` 作成 — Lint / Format ルール設定（推奨ルール + プロジェクト固有設定）
- [x] `npm` スクリプト整備 — `dev`, `build`, `test`, `lint`, `format`, `db:init`

### 1-2: Docker インフラ構築
- [x] `docker-compose.yml` 作成 — DynamoDB Local (port 8000) + DynamoDB Admin UI (port 8001) + Redis/Valkey (port 6379)
- [x] `.env.example` 作成 — 必要な環境変数のテンプレート（`GOOGLE_GENERATIVE_AI_API_KEY`, `EXCHANGE_API_KEY`, `EXCHANGE_SECRET`, `DYNAMODB_ENDPOINT`, `REDIS_URL`, `NODE_ENV`）
- [x] `.gitignore` 作成 — `node_modules/`, `dist/`, `.env`, `*.js.map`

### 1-3: ディレクトリ構造 & エントリポイント
- [x] `src/` ディレクトリ構造作成 — `handlers/`, `services/`, `repositories/`, `providers/`, `schemas/`, `jobs/`, `lib/`, `config/`
- [x] `src/config/env.ts` 作成 — Zod による環境変数バリデーション（起動時に全変数を検証してFail Fast）
- [x] `src/lib/logger.ts` 作成 — pino ロガー初期設定（JSON出力, level設定, child logger対応）
- [x] Vitest 設定 (`vitest.config.ts`) 作成 — テスト環境設定

---

## Phase 2: RSS取得 & AI分析

### 2-1: Zod スキーマ定義
- [x] `src/schemas/ai.ts` 作成 — AI出力スキーマ定義（`InvestmentDecisionSchema`: ticker, action: `"BUY"|"SELL"|"HOLD"`, confidence: 0.0〜1.0, reasoning, targetPrice）
- [x] `src/schemas/news.ts` 作成 — ニュース記事スキーマ（`NewsArticleSchema`: title, url, publishedAt, source, summary）
- [x] `src/schemas/config.ts` 作成 — アプリ設定スキーマ（`AppConfigSchema`: RSS URLリスト, 取引ペアリスト, 信頼度閾値 etc.）

### 2-2: RSS プロバイダー
- [x] `src/providers/rss.ts` 作成 — `rss-parser` を使ったRSS取得（複数フィードURL対応, エラーハンドリング, タイムアウト設定）
- [x] `src/providers/index.ts` 作成 — プロバイダー公開エクスポート

### 2-3: AI分析サービス
- [x] `src/services/ai-analyzer.ts` 作成 — Vercel AI SDK `generateObject()` を使った売買判断（Gemini 2.0 Flash使用, Zodスキーマによる型安全な出力, プロンプトテンプレート）
- [x] `src/services/index.ts` 作成 — サービス公開エクスポート

### 2-4: Fetch ハンドラー（ローカル実行版）
- [x] `src/handlers/fetch-news.ts` 作成 — RSS取得〜AI分析の統合ハンドラー（Lambda対応シグネチャ, ローカル実行対応）

---

## Phase 3: DB保存 & キャッシュ

### 3-1: DynamoDB リポジトリ
- [x] `src/repositories/dynamo-client.ts` 作成 — DynamoDB クライアント初期化（ローカル/本番切り替え, `DYNAMODB_ENDPOINT` 環境変数対応）
- [x] `src/repositories/news-repository.ts` 作成 — `NEWS_ITEM` の CRUD（`saveNewsItem`, `findByUrl`（冪等性チェック用）, `listRecentNews`）
- [x] `src/repositories/trade-repository.ts` 作成 — `TRADE_ITEM` の CRUD（`saveTradeItem`, `listRecentTrades`）
- [x] `src/repositories/state-repository.ts` 作成 — `STATE_ITEM` の取得・更新（`getLatestState`, `updateState`）
- [x] `src/repositories/index.ts` 作成 — リポジトリ公開エクスポート

### 3-2: DynamoDB テーブル初期化スクリプト
- [x] `scripts/db-init.ts` 作成 — テーブル作成スクリプト（`InvestmentTable`, GSI定義, ローカル環境用）

### 3-3: Redis キャッシュ層
- [x] `src/lib/redis-client.ts` 作成 — ioredis クライアント初期化（接続エラーハンドリング, 再接続ポリシー）
- [x] `src/lib/cache.ts` 作成 — 汎用キャッシュユーティリティ（`get`, `set`, `del`, TTL設定）

### 3-4: Fetch ハンドラーにDB統合
- [x] `src/handlers/fetch-news.ts` 更新 — 冪等性チェック（既処理URLをDBで確認）、分析結果をDBに保存

---

## Phase 4: マーケットデータ統合

### 4-1: 暗号資産プロバイダー（ccxt）
- [x] `src/providers/crypto-market.ts` 作成 — ccxt を使ったOHLCVデータ取得（Binance/Bybit対応, RSI計算, Redisキャッシュ統合）
- [x] `src/schemas/market.ts` 作成 — マーケットデータスキーマ（`MarketDataSchema`: symbol, price, rsi, volume, timestamp）

### 4-2: 株式・ETFプロバイダー（yahoo-finance2）
- [x] `src/providers/stock-market.ts` 作成 — yahoo-finance2 を使ったリアルタイム株価取得（クォート取得, Redisキャッシュ統合）

### 4-3: AI分析サービスにマーケットデータ統合
- [x] `src/services/ai-analyzer.ts` 更新 — マーケットデータ（価格/RSI）をプロンプトに組み込む（Gemini 2.5 Pro へのアップグレード条件: conf > 0.7 かつ市場データあり）

### 4-4: Price Fetch ハンドラー
- [x] `src/handlers/fetch-price.ts` 作成 — マーケットデータ取得ハンドラー（Lambda対応シグネチャー）

---

## Phase 5: 注文実行 & ジョブスケジューリング

### 5-1: 取引サービス
- [x] `src/schemas/trade.ts` 作成 — 注文スキーマ（`OrderRequestSchema`, `OrderResultSchema`: orderId, status, executedPrice）
- [x] `src/services/trader.ts` 作成 — ccxt を使った注文実行（残高確認 → 発注 → 結果保存, ペーパートレードモード対応）
- [x] `src/handlers/execute-trade.ts` 作成 — 注文実行ハンドラー（Lambda対応シグネチャー）

### 5-2: BullMQ ジョブスケジューリング
- [x] `src/jobs/fetch-news-job.ts` 作成 — ニュース取得ジョブ定義（スケジュール: 1時間毎, リトライ設定）
- [x] `src/jobs/fetch-price-job.ts` 作成 — 価格取得ジョブ定義（スケジュール: 5分毎, リトライ設定）
- [x] `src/jobs/queue.ts` 作成 — BullMQ Queue/Worker 初期化
- [x] `src/jobs/index.ts` 作成 — ジョブスケジューラーエントリポイント

### 5-3: メインプロセス
- [x] `src/handlers/main.ts` 作成 — ローカル実行用メインエントリポイント（BullMQスケジューラー起動, グレースフルシャットダウン）

---

## Phase 6: Observability

### 6-1: 構造化ログ強化
- [x] `src/lib/logger.ts` 更新 — child logger によるコンテキスト付与（`requestId`, `ticker`, `jobId`）, ログレベルの環境変数制御

### 6-2: OpenTelemetry トレーシング
- [x] `src/lib/tracer.ts` 作成 — OpenTelemetry SDK 初期化（`@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`）
- [x] `src/services/ai-analyzer.ts` 更新 — AI呼び出しにトレーシングspan追加（`ai.generate` span, model/token情報付与）
- [x] `src/services/trader.ts` 更新 — 注文実行にトレーシングspan追加（`trade.execute` span, ticker/side/price付与）

---

## Phase 7: テストカバレッジ

### 7-1: スキーマ・ユーティリティのユニットテスト
- [x] `src/schemas/__tests__/ai.test.ts` 作成 — AI出力スキーマのバリデーションテスト（正常系・異常系）
- [x] `src/schemas/__tests__/news.test.ts` 作成 — ニュース記事スキーマのバリデーションテスト
- [x] `src/lib/__tests__/cache.test.ts` 作成 — キャッシュユーティリティのユニットテスト（Redis モック使用）
- [x] `src/config/__tests__/env.test.ts` 作成 — 環境変数バリデーションのユニットテスト

### 7-2: プロバイダーのユニットテスト
- [x] `src/providers/__tests__/rss.test.ts` 作成 — RSSプロバイダーのユニットテスト（`rss-parser` モック）
- [x] `src/providers/__tests__/crypto-market.test.ts` 作成 — 暗号資産プロバイダーのユニットテスト（ccxt モック）
- [x] `src/providers/__tests__/stock-market.test.ts` 作成 — 株式プロバイダーのユニットテスト（yahoo-finance2 モック）

### 7-3: サービス層のユニットテスト
- [x] `src/services/__tests__/ai-analyzer.test.ts` 作成 — AI分析サービスのユニットテスト（`generateObject` モック, 信頼度閾値ロジック検証）
- [x] `src/services/__tests__/trader.test.ts` 作成 — 取引サービスのユニットテスト（ccxt モック, ペーパートレードモード検証）

### 7-4: リポジトリ層のユニットテスト
- [x] `src/repositories/__tests__/news-repository.test.ts` 作成 — ニュースリポジトリのユニットテスト（DynamoDB モック）
- [x] `src/repositories/__tests__/trade-repository.test.ts` 作成 — 取引リポジトリのユニットテスト（DynamoDB モック）

### 7-5: ハンドラーの統合テスト
- [x] `src/handlers/__tests__/fetch-news.test.ts` 作成 — ニュース取得ハンドラーの統合テスト（RSS→AI→DB フロー全体, 冪等性検証）
- [x] `src/handlers/__tests__/execute-trade.test.ts` 作成 — 注文実行ハンドラーの統合テスト（信頼度閾値 > 0.8 の注文フロー検証）

---

## Phase 8: AWS Lambda 移行準備

### 8-1: Lambda ハンドラー整備
- [x] `src/handlers/fetch-news.ts` 確認・更新 — AWS Lambda シグネチャ完全対応（`APIGatewayProxyHandler` / `ScheduledHandler`）
- [x] `src/handlers/fetch-price.ts` 確認・更新 — AWS Lambda シグネチャ完全対応
- [x] `src/handlers/execute-trade.ts` 確認・更新 — AWS Lambda シグネチャ完全対応

### 8-2: GitHub Actions CI/CD
- [x] `.github/workflows/ci.yml` 作成 — PR時の自動CI（lint, typecheck, test）
- [x] `.github/workflows/deploy.yml` 作成 — mainブランチへのマージ時の自動デプロイ（`docker build` + ECR push or Lambda zip deploy）

### 8-3: AWS インフラ定義（ドキュメント）
- [x] `docs/deployment/aws-setup.md` 作成 — AWS環境セットアップ手順（IAMロール, DynamoDB作成, SSMパラメータ設定, EventBridge + Step Functions設定）
