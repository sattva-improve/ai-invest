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

### Gemini API key validation fails on tests
- Tests mock `src/config/env.ts`. If you add new required env vars, update the env mocks in tests.
