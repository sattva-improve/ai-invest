import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  // AI (GitHub Models API)
  GITHUB_TOKEN: z.string().min(1).optional(),
  GITHUB_MODEL_ID: z.string().default("openai/gpt-4.1"),

  // Exchange
  EXCHANGE_ID: z.string().default("binance"),
  EXCHANGE_API_KEY: z.string().default(""),
  EXCHANGE_SECRET: z.string().default(""),

  // DynamoDB
  DYNAMODB_ENDPOINT: z.string().url().optional(),
  DYNAMODB_REGION: z.string().default("ap-northeast-1"),
  DYNAMODB_TABLE_NAME: z.string().default("InvestmentTable"),

  // Redis (optional — skipped when not set)
  REDIS_URL: z.string().optional(),

  // App
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  PAPER_TRADE: z
    .string()
    .transform((v) => v === "true")
    .default("true"),
  CONFIDENCE_THRESHOLD: z
    .string()
    .transform((v) => Number.parseFloat(v))
    .pipe(z.number().min(0).max(1))
    .default("0.8"),
  MAX_ORDER_VALUE_BTC: z
    .string()
    .transform((v) => Number.parseFloat(v))
    .pipe(z.number().positive())
    .default("0.001"),
  MAX_ORDER_VALUE_JPY: z
    .string()
    .transform((v) => Number.parseFloat(v))
    .pipe(z.number().positive())
    .default("200"),
  MAX_LEVERAGE: z
    .string()
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().min(1).max(20))
    .default("1"),
  MARGIN_MODE: z.enum(["cross", "isolated"]).default("isolated"),
  ENABLE_SHORT_SELLING: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const env = validateEnv();
