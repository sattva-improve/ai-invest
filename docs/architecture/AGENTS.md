# ARCHITECTURE DOCS

Architecture decisions and system design diagrams for the trading bot.

## FILES
| File | Contents |
|------|----------|
| system-overview.mmd | Local Docker deployment topology (Ubuntu → Docker → handlers) |
| future-system-overview.mmd | AWS target: EventBridge → Step Functions → 3 Lambdas |
| process-flow.mmd | Sequence diagram: Scheduler → Fetch → AI → Trade |

## SYSTEM TOPOLOGY (local)
```
Ubuntu Server
└── Docker
    ├── Scheduler / Main Process
    ├── NewsFetcher   (RSS → Market data)
    ├── PriceFetcher  (ccxt)
    ├── AI Analyzer   (Gemini API)
    ├── Order Executor (Exchange API)
    └── DynamoDB Local
```

## AWS TARGET TOPOLOGY
```
EventBridge Scheduler
└── Step Functions Orchestrator
    ├── Step 1: λ Fetch News
    ├── Step 2: λ Analyze (Gemini)
    └── Step 3: λ Trade (Exchange)
        → DynamoDB Global
        → SSM (API keys)
```

## DATA FLOW (process-flow.mmd summary)
1. Scheduler triggers Fetcher
2. Fetcher checks DynamoDB idempotency (skip if already processed)
3. Fetcher sends article text to AI → receives `{ ticker, action, conf }`
4. Result saved to DynamoDB (always)
5. If `conf > 0.8`: Trader checks balance → places order → logs trade

## CONVENTIONS
- Diagrams use Mermaid syntax (`.mmd` extension)
- `graph TD` for topology, `sequenceDiagram` for flows, `erDiagram` for schema
- Comments in Japanese are intentional (author's native language)
