# Local Development Runbook

## Prerequisites
- Node.js v22+
- Docker + Docker Compose

## 1) Setup
```bash
npm install
cp .env.example .env
docker compose up -d
npm run db:init
```

## 2) Run
```bash
npm run dev
```

## 3) Useful commands
```bash
npm run lint
npm run build
npm test
```

## 4) Troubleshooting
### DynamoDB Local
- Check container status: `docker compose ps`
- Admin UI: http://localhost:8001
- Endpoint: `DYNAMODB_ENDPOINT=http://localhost:8000`

### Redis
- Check container status: `docker compose ps`
- Default URL: `REDIS_URL=redis://localhost:6379`

### GitHub Copilot Models API / Token issues
- The AI analysis uses GitHub Copilot Models API via `@ai-sdk/openai-compatible`. Authentication requires a GitHub Personal Access Token with `models:read` scope, set as `GITHUB_TOKEN` in `.env`.
- Tests mock `src/config/env.ts`. If you add new required env vars, update the env mocks in tests. `GITHUB_MODEL_ID` has a default value (`openai/gpt-4.1`), so tests pass without explicit values. `GITHUB_TOKEN` is required but mocked in tests.
- 詳細な AWS デプロイ手順は [AWS セットアップガイド](../deployment/aws-setup.md) を参照してください。
