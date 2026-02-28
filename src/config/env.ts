import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  // AI
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1, "Gemini API key is required"),

  // Exchange
  EXCHANGE_ID: z.string().default("binance"),
  EXCHANGE_API_KEY: z.string().default(""),
  EXCHANGE_SECRET: z.string().default(""),

  // DynamoDB
  DYNAMODB_ENDPOINT: z.string().url().optional(),
  DYNAMODB_REGION: z.string().default("ap-northeast-1"),
  DYNAMODB_TABLE_NAME: z.string().default("InvestmentTable"),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

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
