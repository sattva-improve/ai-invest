# AI-Powered Algorithmic Trading Bot (TypeScript)

## 📖 Overview

RSSフィード（定性情報）とマーケットデータ（定量情報）を取得し、LLM を用いて投資判断を行う自動売買システムです。
[Vercel AI SDK](https://sdk.vercel.ai/) + GitHub Copilot Models API による **Structured Output** で売買シグナルを JSON 生成し、株式・暗号資産取引所へ自動発注します。

ローカルは Docker（DynamoDB Local + Redis）で動作し、将来的な **AWS Serverless (Lambda + DynamoDB + EventBridge)** への移行を前提に設計されています。

### 対応マーケット

| Market | Exchange | Broker | Ticker例 |
|--------|----------|--------|----------|
| 🇯🇵 **日本株** | 東京証券取引所 (TSE/JPX) | au Kabucom API / SBI HYPER SBI 2 / IBKR | `7203.T`, `9984.T` |
| 🇺🇸 **米国株** | NYSE / NASDAQ | IBKR Client Portal API / Alpaca | `AAPL`, `NVDA`, `MSFT` |
| 🇨🇳 **中国株** | HKEX (H株) + 上海・深圳 (A株) | Futu OpenAPI / IBKR | `0700.HK`, `600519.SS` |
| 🪙 **暗号資産** | Binance / Bybit | ccxt (legacy) | `BTC/USDT` |

## 🚀 Features

- **Multi-Market Support**: 日本株・米国株・中国株（H株/A株）・暗号資産に対応したマーケットルーター設計
- **Multi-Source Intelligence**: ニュース(RSS: 日経/ロイター/新華社) とテクニカル指標を組み合わせた複合判断
- **AI Analysis**: Vercel AI SDK (`generateObject()`) + Zod スキーマで型安全な売買シグナルを生成
  - 出力: `{ market: "JP"|"US"|"CN", ticker, action: "BUY"|"SELL"|"HOLD", confidence, currency }`
- **AI Analysis**: GitHub Copilot Models API で投資判断を生成。モデルは `GITHUB_MODEL_ID` で設定可能（デフォルト: `openai/gpt-4.1`）
- **Market-Aware Scheduling**: 市場ごとのタイムゾーン（JST/ET/CST）に合わせた独立スケジューリング
- **Cloud-Ready Architecture**: ハンドラーパターン + リポジトリパターンで、コード変更なしに AWS Lambda へ移行可能
- **NoSQL Native**: DynamoDB (Local → AWS) を採用。マーケット別の PK 名前空間 (`TRADE#JP`, `TRADE#US`, `TRADE#CN`)
- **Multi-Currency**: 全取引を元通貨 + JPY換算で記録し、統一P&Lレポートを実現
- **Paper Trade First**: 全ブローカーはデフォルト `PAPER_TRADE=true` — 本番移行時に明示的に解除
- **High-Performance Caching**: Redis / Valkey によるマーケットデータキャッシュ & API レートリミット
- **Reliable Scheduling**: BullMQ (Redis-backed) による信頼性の高いジョブスケジューリング
- **Observability**: pino (構造化ログ) + OpenTelemetry (トレーシング) で AI 呼び出し〜約定まで可視化
- **Type Safety**: TypeScript 5.x + Zod による堅牢な型安全性
- **Fast DX**: Biome (Lint/Format) + Vitest (テスト) による高速な開発体験

## 🛠 Tech Stack

- **Language / Runtime**: TypeScript 5.x, Node.js v22 (LTS)
- **AI / LLM**:
  - [Vercel AI SDK](https://sdk.vercel.ai/) (`ai` + `@ai-sdk/openai-compatible`) — 軽量な Structured Output 生成
  - GitHub Copilot Models API (default: `openai/gpt-4.1`) — GitHub Personal Access Token で認証
- **Schema / Validation**: Zod — AI出力・DB エンティティ・設定・APIレスポンスの型安全なバリデーション
- **Market Data**:
  - [yahoo-finance2](https://github.com/gadicc/node-yahoo-finance2) — JP (7203.T) / US (AAPL) / HK (0700.HK) / A株 (600519.SS)
  - [J-Quants API](https://jpx-jquants.com/) (REST) — 日本株公式データ (JPX提供、要無料登録)
  - [ccxt](https://github.com/ccxt/ccxt) — 暗号資産取引所 (Binance, Bybit 等)
- **Brokers**:
  - [au Kabucom API](https://kabucom.github.io/kabusapi/ptal/) — 日本株 (kabuステーション経由、Windows専用)
  - [SBI証券 HYPER SBI 2](https://go.sbisec.co.jp/lp/lp_hyper_sbi2_211112_feature.html) — 日本株 (Windows/Mac対応、ローカル開発専用)
  - [IBKR Client Portal API](https://ibkrcampus.com/ibkr-api-page/cpapi-v1/) + [`@stoqey/ib`](https://www.npmjs.com/package/@stoqey/ib) — JP/US/HK株
  - [Futu OpenAPI](https://openapi.futunn.com/futu-api-doc/en/) — 中国株/HK株 (Moomoo Japan)
  - [Alpaca](https://docs.alpaca.markets/) + [`@alpacahq/alpaca-trade-api`](https://www.npmjs.com/package/@alpacahq/alpaca-trade-api) — US株ペーパートレード
- **Task Scheduling**: [BullMQ](https://bullmq.io/) (Redis-backed job queue)
- **Observability**:
  - [pino](https://github.com/pinojs/pino) — 構造化ログ (JSON)
  - [OpenTelemetry](https://opentelemetry.io/) — トレーシング (AI呼び出し・約定追跡)
- **Testing**: [Vitest](https://vitest.dev/) — 高速ユニット / 統合テスト
- **Linting / Formatting**: [Biome](https://biomejs.dev/) — ESLint + Prettier の統合代替 (高速)
- **Infrastructure**: Docker, Docker Compose
- **CI/CD**: GitHub Actions
- **OS**: Ubuntu Server 24.04 (Local) → AWS Lambda (Prod)

## 📂 Architecture

詳細な設計図は `docs/` 以下を参照してください。

- **System Diagram**: [docs/architecture/system-overview.mmd](./docs/architecture/system-overview.mmd)
- **Data Flow**: [docs/architecture/process-flow.mmd](./docs/architecture/process-flow.mmd)
- **Future (AWS Target) Diagram**: [docs/architecture/future-system-overview.mmd](./docs/architecture/future-system-overview.mmd)
- **Database Schema**: [docs/database/schema.mmd](./docs/database/schema.mmd)
- **Broker Setup**:
  - [Japanese Stocks (JP)](./docs/brokers/jp-stocks.md) — au Kabucom API / IBKR / J-Quants
  - [US Stocks (US)](./docs/brokers/us-stocks.md) — IBKR / Alpaca
  - [Chinese Stocks (CN)](./docs/brokers/cn-stocks.md) — Futu OpenAPI / IBKR / Stock Connect
- **Docs Index**: [docs/README.md](./docs/README.md)
- **Local Runbook**: [docs/runbook/local-development.md](./docs/runbook/local-development.md)
- **AWS Setup Guide**: [docs/deployment/aws-setup.md](./docs/deployment/aws-setup.md)

### Data Flow (Summary)

```
Scheduler (market-aware: JP/US/CN trading hours)
  → NewsFetcher (RSS: Nikkei/Reuters/Xinhua)
  → PriceFetcher (yahoo-finance2 / J-Quants)
  → [idempotency check in DynamoDB by URL]
  → AI Analysis → { market, ticker, action, confidence, currency }
  → save result to DynamoDB (NEWS#JP | NEWS#US | NEWS#CN)
  → if confidence > 0.8 → Market Router
      → JP Trader  → au Kabucom API / IBKR
      → US Trader  → IBKR Client Portal API / Alpaca
      → CN Trader  → Futu OpenAPI / IBKR
  → save trade to DynamoDB (TRADE#JP | TRADE#US | TRADE#CN)
```

### Project Structure

```
src/
├── handlers/          # エントリポイント (Lambda / Local 共通)
│   ├── fetch-news.ts  # 全マーケットのRSSフィード取得
│   ├── fetch-price.ts # 全マーケットのOHLCVデータ取得
│   ├── analyze.ts     # AI分析 + マーケットルーティング
│   ├── trade-jp.ts    # 日本株発注 (au Kabucom / IBKR)
│   ├── trade-us.ts    # 米国株発注 (IBKR / Alpaca)
│   └── trade-cn.ts    # 中国株発注 (Futu / IBKR)
├── services/
│   ├── ai/            # Vercel AI SDK + GitHub Copilot Models API 分析
│   └── traders/       # per-market trader: jp-trader, us-trader, cn-trader
├── repositories/      # データアクセス層 (DynamoDB)
├── providers/         # 外部データ取得 (RSS, yahoo-finance2, J-Quants, ccxt)
├── schemas/           # Zod スキーマ定義 (AI出力, DB, Config)
├── jobs/              # BullMQ ジョブ定義
├── lib/               # 共通ユーティリティ (logger, tracer, currency-converter)
└── config/            # 環境変数・設定管理
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** v22+ (LTS)
- **Docker** & Docker Compose v2
- **GitHub Personal Access Token** (`models:read` スコープ付き)
- ブローカーアカウント (各市場の `docs/brokers/` を参照)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/algo-trade-bot-ts.git
   cd algo-trade-bot-ts
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup Environment Variables**
   ```bash
   cp .env.example .env
   # .env を編集し、APIキー等を設定
   ```

4. **Start Infrastructure (DynamoDB Local + Redis)**
   ```bash
   docker compose up -d
   # DynamoDB Admin UI: http://localhost:8001
   # Redis: localhost:6379
   ```

5. **Initialize Database Tables**
   ```bash
   npm run db:init
   ```

6. **Run Development Mode**
   ```bash
   npm run dev
   ```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | 開発モードで起動 (watch) |
| `npm run build` | TypeScript ビルド |
| `npm run test` | Vitest でテスト実行 |
| `npm run lint` | Biome で Lint チェック |
| `npm run format` | Biome でフォーマット |
| `npm run db:init` | DynamoDB テーブル初期化 |

## 🗓 Roadmap

- [ ] **Phase 1**: 環境構築 — Docker / TypeScript / Biome / Vitest セットアップ
- [ ] **Phase 2**: RSS取得 & AI分析 — Vercel AI SDK + Zod Structured Output 実装（マーケット対応）
- [ ] **Phase 3**: DB & キャッシュ — DynamoDB マルチマーケットスキーマ + Redis 統合
- [ ] **Phase 4**: マーケットデータ — yahoo-finance2 (JP/US/HK/CN) + J-Quants
- [ ] **Phase 5**: JP Trader — au Kabucom API 統合
- [ ] **Phase 6**: US Trader — IBKR Client Portal API + Alpaca 統合
- [ ] **Phase 7**: CN Trader — Futu OpenAPI (Moomoo Japan) 統合
- [ ] **Phase 8**: ジョブスケジューリング — BullMQ、マーケット時間対応
- [ ] **Phase 9**: Observability — pino 構造化ログ + OpenTelemetry トレーシング
- [ ] **Phase 10**: AWS Lambda 移行 — EventBridge (市場別) + Step Functions

## 🛡 Disclaimer

本ソフトウェアは教育および実験目的で作成されています。実際の投資（暗号資産・日本株式・外国株式を含む全資産クラス）による損失について、開発者は一切の責任を負いません。

APIキーの管理には十分注意し、取引所・証券会社アカウントの出金権限は必ず無効にしてください。まずは `PAPER_TRADE=true`（ペーパートレード）で動作検証することを強く推奨します。
