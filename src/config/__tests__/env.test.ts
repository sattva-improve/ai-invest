import { z } from "zod";

const envSchema = z.object({
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_MODEL_ID: z.string().default("openai/gpt-4.1"),
  EXCHANGE_ID: z.string().default("binance"),
  EXCHANGE_API_KEY: z.string().default(""),
  EXCHANGE_SECRET: z.string().default(""),
  DYNAMODB_ENDPOINT: z.string().url().optional(),
  DYNAMODB_REGION: z.string().default("ap-northeast-1"),
  DYNAMODB_TABLE_NAME: z.string().default("InvestmentTable"),
  REDIS_URL: z.string().optional(),
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

describe("envSchema", () => {
  it("applies default values when GITHUB_TOKEN is provided", () => {
    const result = envSchema.parse({ GITHUB_TOKEN: "ghp_test" });

    expect(result.GITHUB_TOKEN).toBe("ghp_test");
    expect(result.GITHUB_MODEL_ID).toBe("openai/gpt-4.1");
    expect(result.EXCHANGE_ID).toBe("binance");
    expect(result.PAPER_TRADE).toBe(true);
    expect(result.CONFIDENCE_THRESHOLD).toBe(0.8);
  });

  it("fails when GITHUB_TOKEN is missing", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("fails when GITHUB_TOKEN is empty string", () => {
    const result = envSchema.safeParse({ GITHUB_TOKEN: "" });
    expect(result.success).toBe(false);
  });

  it("transforms PAPER_TRADE='true' to boolean true", () => {
    const result = envSchema.parse({
      GITHUB_TOKEN: "ghp_test",
      PAPER_TRADE: "true",
    });

    expect(result.PAPER_TRADE).toBe(true);
    expect(typeof result.PAPER_TRADE).toBe("boolean");
  });

  it("transforms PAPER_TRADE='false' to boolean false", () => {
    const result = envSchema.parse({
      GITHUB_TOKEN: "ghp_test",
      PAPER_TRADE: "false",
    });

    expect(result.PAPER_TRADE).toBe(false);
    expect(typeof result.PAPER_TRADE).toBe("boolean");
  });

  it("transforms CONFIDENCE_THRESHOLD='0.7' to number 0.7", () => {
    const result = envSchema.parse({
      GITHUB_TOKEN: "ghp_test",
      CONFIDENCE_THRESHOLD: "0.7",
    });

    expect(result.CONFIDENCE_THRESHOLD).toBe(0.7);
    expect(typeof result.CONFIDENCE_THRESHOLD).toBe("number");
  });

  it("fails when LOG_LEVEL is invalid", () => {
    const result = envSchema.safeParse({
      GITHUB_TOKEN: "ghp_test",
      LOG_LEVEL: "verbose",
    });

    expect(result.success).toBe(false);
  });

  it("applies default LOG_LEVEL of 'info'", () => {
    const result = envSchema.parse({ GITHUB_TOKEN: "ghp_test" });
    expect(result.LOG_LEVEL).toBe("info");
  });

  it("applies default NODE_ENV of 'development'", () => {
    const result = envSchema.parse({ GITHUB_TOKEN: "ghp_test" });
    expect(result.NODE_ENV).toBe("development");
  });
});
