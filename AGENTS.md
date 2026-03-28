# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-28
**Status:** Active development

## OVERVIEW
AI-powered algorithmic trading bot: RSS feeds + market data → LLM (GitHub Copilot Models API) investment decisions → stock/crypto exchange orders.
TypeScript/Node.js, Docker-first, AWS Lambda migration path.

**Supported Markets:**
- 🇯🇵 **Japanese stocks** — Tokyo Stock Exchange (TSE/JPX): broker au Kabucom API / Interactive Brokers
- 🇺🇸 **US stocks** — NYSE / NASDAQ: broker Interactive Brokers Client Portal API / Alpaca (paper trade)
- 🇨🇳 **Chinese stocks** — HKEX H-shares + Shanghai/Shenzhen A-shares (Stock Connect): broker Futu OpenAPI / Interactive Brokers
- 🪙 **Crypto** — Binance/Bybit via ccxt (legacy, still supported)

## STRUCTURE
```
./
├── docs/
│   ├── architecture/    # Mermaid system/flow diagrams
│   ├── database/        # DynamoDB schema (single-table design)
│   ├── brokers/         # Broker/API setup guides per market
│   ├── deployment/      # AWS setup guide
│   ├── runbook/         # Local development guide
│   └── ja/              # Japanese language docs
├── oh-my-opencode.jsonc # AI agent team config
└── README.md
```

**Source code:**
```
src/
├── handlers/         # Lambda/Local entry points (handler pattern)
├── services/         # Business logic: AI analysis, order execution
│   └── traders/      # Per-market trader: jp-trader, us-trader, cn-trader
├── repositories/     # DynamoDB data access layer
├── providers/        # External data: RSS feeds, ccxt, yahoo-finance2, J-Quants
├── schemas/          # Zod schemas: AI output, DB entities, config
├── jobs/             # BullMQ job definitions
├── lib/              # Shared utils: pino logger, OTel tracer, currency converter
└── config/           # Env vars + app configuration
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Architecture decisions | docs/architecture/*.mmd |
| Local system topology | docs/architecture/system-overview.mmd |
| Data flow (sequence) | docs/architecture/process-flow.mmd |
| Future AWS design | docs/architecture/future-system-overview.mmd |
| DynamoDB schema | docs/database/schema.mmd |
| JP broker setup | docs/brokers/jp-stocks.md |
| US broker setup | docs/brokers/us-stocks.md |
| CN broker setup | docs/brokers/cn-stocks.md |
| AWS deployment | docs/deployment/aws-setup.md |
| Agent team config | oh-my-opencode.jsonc |

## DATA FLOW (from process-flow.mmd)
```
Scheduler (market-aware: JP/US/CN trading hours)
  → NewsFetcher (RSS: Nikkei/Reuters/Xinhua) + PriceFetcher (yahoo-finance2 / J-Quants)
  → [check idempotency in DynamoDB by URL]
  → AI (analyze: { market, ticker, action, conf, currency })
  → save result to DynamoDB
  → if conf > 0.8 → MarketRouter
      → JP Trader → au Kabucom API / IBKR
      → US Trader → IBKR Client Portal API / Alpaca
      → CN Trader → Futu OpenAPI / IBKR
  → save trade to DynamoDB (TRADE#JP | TRADE#US | TRADE#CN)
```

## DATABASE (single-table DynamoDB) — Multi-Market Design
| Entity | PK | SK | Key Fields |
|--------|----|----|------------|
| NEWS_ITEM | `NEWS#JP\|US\|CN` | `TIMESTAMP#UUID` | Title, Url, Market, Ticker, Action, Confidence, Sentiment |
| TRADE_ITEM | `TRADE#JP\|US\|CN` | `TIMESTAMP#ORDER_ID` | Market, Ticker, Exchange, Side, Quantity, Price, Currency, PriceJPY, Profit, Broker |
| BALANCE_ITEM | `BALANCE#JP\|US\|CN` | `LATEST` | CashBalance, Currency, CashBalanceJPY, Broker |
| STATE_ITEM | `STATE` | `{market}#LATEST` | LastRun, LastNewsUrl, Status |
| PRICE_ITEM | `PRICE#{ticker}` | `TIMESTAMP` | Open, High, Low, Close, Volume, Currency, Interval |

**GSI: TypeIndex** — HASH: `type`, RANGE: `SK` — cross-market queries (e.g. all TRADE items)

## BROKERS / APIs

### 🇯🇵 Japanese Stocks (JP)
| Broker | API Type | Notes |
|--------|----------|-------|
| **au Kabucom API** (推奨) | REST + WebSocket | 個人向けAPIの中で最も充実。kabuステーション経由でローカル接続 |
| Interactive Brokers (IBKR) | REST (Client Portal API) | 日本株・米国株・香港株を1つのAPIで統一管理可能 |
| **SBI証券 HYPER SBI 2** | REST (localhost) | Windows/Mac対応。デスクトップアプリ経由。サーバーデプロイ不可—ローカル開発専用 |

### 🇺🇸 US Stocks (US)
| Broker | API Type | Notes |
|--------|----------|-------|
| **Interactive Brokers** (推奨) | REST (Client Portal API) | 日本居住者対応。JP/US/HK株を統一管理 |
| Alpaca | REST | 米国法人向けが主体だが Paper Trade は日本から可能 |

### 🇨🇳 Chinese Stocks (CN)
| Broker | API Type | Notes |
|--------|----------|-------|
| **Futu OpenAPI** (推奨) | REST / WebSocket | 富途牛牛 (Moomoo)。HK株 + 米国株 + 深沪港通(A株)対応。日本対応 |
| Interactive Brokers | REST (Client Portal API) | HK上場株 + Stock Connect経由のA株 |

### 📊 Market Data APIs
| Source | Coverage | Package |
|--------|----------|---------|
| **yahoo-finance2** | JP (7203.T) / US (AAPL) / HK (0700.HK) / A-shares (600519.SS) | `yahoo-finance2` |
| **J-Quants API** | 日本株 公式データ (JPX提供) | REST API (要無料登録) |
| **ccxt** | 暗号資産 (Binance/Bybit 等) | `ccxt` |

## MARKET HOURS (JST)
| Market | Open | Close | Notes |
|--------|------|-------|-------|
| 🇯🇵 TSE (東京証券取引所) | 09:00 | 15:30 | 昼休み 11:30-12:30 |
| 🇺🇸 NYSE/NASDAQ | 23:30 | 06:00+1 | 夏時間: 22:30-05:00 |
| 🇨🇳 SSE/SZSE (上海・深圳) | 10:30 | 16:00 | 昼休み 12:30-14:00 |
| 🇭🇰 HKEX (香港) | 10:30 | 17:00 | 昼休み 13:00-14:00 |

## TICKER FORMAT
| Market | Format | Example |
|--------|--------|---------|
| 🇯🇵 Tokyo | `{code}.T` | `7203.T` (Toyota), `9984.T` (SoftBank) |
| 🇺🇸 US | `{symbol}` | `AAPL`, `MSFT`, `NVDA` |
| 🇭🇰 Hong Kong | `{code}.HK` | `0700.HK` (Tencent), `0005.HK` (HSBC) |
| 🇨🇳 Shanghai | `{code}.SS` | `600519.SS` (Moutai), `601318.SS` (PICC) |
| 🇨🇳 Shenzhen | `{code}.SZ` | `000858.SZ` (Wuliangye), `002594.SZ` (BYD) |

## AGENT TEAM
| Agent | Focus |
|-------|-------|
| backend | src/handlers, services, repositories, lib, config |
| ai-engineer | src/services/ai, src/schemas |
| data-engineer | src/providers, src/jobs |
| devops | docker, .github, deployment |
| test-engineer | tests, src/**/*.test.ts, src/**/*.spec.ts |
| architect | docs/architecture, docs/database, docs/brokers |
| code-reviewer | all files |

## VALIDATION RULES
- **Lint**: REQUIRED — Biome (`npm run lint`)
- **Type Check**: REQUIRED
- **Tests**: NOT required for commit
- **Warnings**: only `info`/`hint` allowed

## COMMANDS (planned — package.json not yet created)
```bash
npm run dev       # Watch mode
npm run build     # TS compile
npm run test      # Vitest
npm run lint      # Biome lint
npm run format    # Biome format
npm run db:init   # DynamoDB table init
docker compose up -d  # Start DynamoDB Local + Redis
```

## TECH STACK
- **Runtime**: TypeScript 5.x, Node.js v22
- **AI**: Vercel AI SDK (`generateObject()`) + GitHub Copilot Models API (`@ai-sdk/openai-compatible`, default: `openai/gpt-4.1`)
- **Validation**: Zod — AI output, DB entities, config all typed
- **DB**: DynamoDB (single-table) — Local dev → AWS prod
- **Cache/Queue**: Redis/Valkey (cache + rate limit) + BullMQ (jobs)
- **Market data**: yahoo-finance2 (JP/US/HK/CN stocks), J-Quants (JP official), ccxt (crypto)
- **Brokers**: au Kabucom API (JP), IBKR Client Portal API (JP/US/HK), Futu OpenAPI (CN/HK/US), Alpaca (US paper)
- **Observability**: pino (structured JSON logs) + OpenTelemetry (tracing)
- **Infra**: Docker Compose (local) → Lambda + EventBridge + Step Functions (AWS)
- **DX**: Biome (lint/format), Vitest (tests), GitHub Actions (CI/CD)

## ARCHITECTURE NOTES
- **Handler pattern**: All entry points in `handlers/` — zero-change Lambda migration
- **Repository pattern**: DynamoDB access isolated in `repositories/` only
- **Market Router**: Routes AI decisions to the correct per-market trader service
- **Single AI model**: GitHub Copilot Models API — configurable via `GITHUB_MODEL_ID`
- **Idempotency**: Check DynamoDB before processing news (no duplicate orders)
- **Confidence threshold**: Only place orders when AI confidence > 0.8
- **Multi-currency**: All trades stored with original currency + JPY-equivalent for unified reporting
- **Market-aware scheduling**: Separate EventBridge rules per market timezone (JP/US/CN)
- **Paper trade first**: All new brokers default `PAPER_TRADE=true` until validated
- **API keys**: Never hardcode — use SSM Parameter Store in AWS, `.env` locally
- **Single-broker option**: IBKR Client Portal API can replace all 3 market-specific brokers

## ROADMAP
1. **Phase 1** — Environment: Docker/TS/Biome/Vitest setup
2. **Phase 2** — RSS + AI Analysis (Vercel AI SDK + Zod structured output, market-aware)
3. **Phase 3** — DB + Cache (DynamoDB multi-market schema + Redis)
4. **Phase 4** — Market Data (yahoo-finance2 JP/US/CN, J-Quants)
5. **Phase 5** — JP Trader (au Kabucom API integration)
6. **Phase 6** — US Trader (IBKR Client Portal API)
7. **Phase 7** — CN Trader (Futu OpenAPI)
8. **Phase 8** — Job Scheduling (BullMQ, market-hour-aware)
9. **Phase 9** — Observability (pino + OTel)
10. **Phase 10** — AWS Lambda migration (EventBridge per market + Step Functions)