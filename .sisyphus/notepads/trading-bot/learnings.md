# Learnings — trading-bot

## [2026-02-28] プロジェクト初期分析

### アーキテクチャ方針
- ハンドラーパターン: `src/handlers/` が全エントリポイント — Lambda移行時もコード変更不要
- リポジトリパターン: DynamoDBアクセスは `src/repositories/` に完全分離
- 信頼度閾値: `conf > 0.8` のみ注文実行（process-flow.mmd より）

### AIモデル使い分け
- Gemini 2.0 Flash: 高頻度・初期分析（RSS記事の一次判断）
- Gemini 2.5 Pro: 高確度案件（conf > 0.7 + マーケットデータあり の場合にアップグレード）

### DynamoDB シングルテーブル設計
- テーブル名: `InvestmentTable`
- NEWS_ITEM: PK=`NEWS`, SK=`TIMESTAMP#UUID`
- TRADE_ITEM: PK=`TRADE`, SK=`TIMESTAMP#ORDER_ID`
- STATE_ITEM: PK=`STATE`, SK=`LATEST`

### 技術スタック確定
- Runtime: TypeScript 5.x, Node.js v22
- Validation: Zod（AI出力・DB・Config 全て）
- Logger: pino（JSON構造化ログ）
- Queue: BullMQ + Redis
- Market data: ccxt（暗号資産）+ yahoo-finance2（株式・ETF）
- Lint/Format: Biome
- Test: Vitest


## ioredis Import (2026-02-28)
- With `module: NodeNext`, use `import { Redis } from "ioredis"` (named export), NOT `import Redis from "ioredis"` (default).
- Default import resolves as namespace, not the Redis class — causes TS2709 "Cannot use namespace as type".


## yahoo-finance2 Usage (2026-02-28)
- Version 2.14.0 exports a class constructor as default export, not an instance.
- Must instantiate with `const yf = new yahooFinance()` before calling `yf.quote(symbol)`.
- Direct `yahooFinance.quote(symbol)` fails TS2769 because `quote()` has `this: ModuleThis` context requirement.
- `regularMarketTime` is typed as `Date | undefined` (not epoch seconds) — use `.toISOString()` directly.
- `regularMarketPrice` and `regularMarketVolume` are optional — null-check required.
- RSI is NOT available from yahoo-finance2 quote endpoint — set to `undefined`.


## OTel Observability (2026-02-28)

### OTel SDK Setup
- `@opentelemetry/sdk-node` NodeSDK accepts `serviceName`, `traceExporter`, and `instrumentations` — clean one-shot init.
- `getNodeAutoInstrumentations()` from `@opentelemetry/auto-instrumentations-node` adds HTTP/Express/etc instrumentation automatically.
- `OTLPTraceExporter` defaults to gRPC; use `@opentelemetry/exporter-trace-otlp-http` for HTTP/protobuf (port 4318).
- `trace.getTracer(name)` returns a no-op tracer when SDK isn't initialized — graceful degradation by design.

### Span Pattern
- `tracer.startActiveSpan("name", async (span) => { try {...} catch {...} finally { span.end() } })` is the canonical pattern.
- Must call `span.end()` in `finally` — otherwise spans leak.
- `span.setStatus({ code: SpanStatusCode.ERROR, message })` for error recording, then re-throw.
- `span.setAttribute(key, value)` for structured attributes — use semantic conventions where possible.

### Project Notes
- Pre-existing test file TS errors (missing vitest types in tsconfig) — not related to Phase 6 work.
- `logger.child()` pattern already in use — `createLogger` is an ergonomic wrapper with typed `LogContext`.


## Lambda Migration (Phase 8) (2026-02-28)

### ScheduledHandler Return Type
- AWS `ScheduledHandler` type expects `void | Promise<void>` — cannot return result objects.
- Pattern: `await handlerFn(config)` (discard return), NOT `return handlerFn(config)`.
- This is fine since Lambda results go to CloudWatch logs, not caller.

### Type Casting for ScheduledEvent
- `ScheduledEvent` type from `@types/aws-lambda` doesn't have index signature.
- Need double cast `event as unknown as Record<string, unknown>` to access `.detail` for Step Functions payloads.
- In Step Functions integration, decision data flows via `event.detail` or directly as the event.

### Lambda Config Pattern
- `AppConfigSchema.parse({...})` provides defaults via Zod `.default()` — only need to supply `rssFeeds` and `tradingPairs`.
- `confidenceThreshold`, `fetchIntervalMinutes`, etc. all have Zod defaults.
- Default config is module-level constant — parsed once at cold start, reused across invocations.

### Biome LSP
- `biome` is not in system PATH — only accessible via `npx` or `npm run lint`.
- LSP diagnostics tool fails but `npm run lint` works fine for validation.