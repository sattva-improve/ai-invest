# Learnings - Phase 1

## Biome Lint
- `parseFloat()` global → Biome requires `Number.parseFloat()` (ES2015 namespace rule `style/useNumberNamespace`)
- Always run `npx biome lint` on created files before considering done

## ESM + NodeNext
- Import paths MUST include `.js` extension even for `.ts` files (e.g. `from "../config/env.js"`)
- `tsconfig.json` uses `module: "NodeNext"` + `moduleResolution: "NodeNext"`

## pino-pretty
- Listed in `dependencies` (not devDependencies) — intentional per project convention
- Used as `transport.target` in development mode only

## Zod env validation
- `process.env` values are always strings — need `.transform()` for boolean/number conversion
- `PAPER_TRADE`: string → boolean via `v === "true"`
- `CONFIDENCE_THRESHOLD`: string → float via `Number.parseFloat(v)` then `.pipe(z.number())`
- `safeParse` + `process.exit(1)` for fail-fast pattern

## LSP Diagnostics
- Biome binary not in PATH for LSP diagnostics — use `npx biome lint` as fallback
