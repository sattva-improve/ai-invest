import { z } from "zod";

// Re-create the env schema directly so we don't trigger process.exit(1)
// from the actual env.ts module
const envSchema = z.object({
	GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1, "Gemini API key is required"),
	EXCHANGE_ID: z.string().default("binance"),
	EXCHANGE_API_KEY: z.string().default(""),
	EXCHANGE_SECRET: z.string().default(""),
	DYNAMODB_ENDPOINT: z.string().url().optional(),
	DYNAMODB_REGION: z.string().default("ap-northeast-1"),
	DYNAMODB_TABLE_NAME: z.string().default("InvestmentTable"),
	REDIS_URL: z.string().default("redis://localhost:6379"),
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
	it("fails when GOOGLE_GENERATIVE_AI_API_KEY is missing", () => {
		const result = envSchema.safeParse({});

		expect(result.success).toBe(false);
		if (!result.success) {
			const keys = result.error.issues.map((i) => i.path[0]);
			expect(keys).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
		}
	});

	it("applies default values (EXCHANGE_ID=binance, PAPER_TRADE=true, CONFIDENCE_THRESHOLD=0.8)", () => {
		const result = envSchema.parse({
			GOOGLE_GENERATIVE_AI_API_KEY: "test-key-123",
		});

		expect(result.EXCHANGE_ID).toBe("binance");
		expect(result.PAPER_TRADE).toBe(true);
		expect(result.CONFIDENCE_THRESHOLD).toBe(0.8);
	});

	it("transforms PAPER_TRADE='true' to boolean true", () => {
		const result = envSchema.parse({
			GOOGLE_GENERATIVE_AI_API_KEY: "key",
			PAPER_TRADE: "true",
		});

		expect(result.PAPER_TRADE).toBe(true);
		expect(typeof result.PAPER_TRADE).toBe("boolean");
	});

	it("transforms PAPER_TRADE='false' to boolean false", () => {
		const result = envSchema.parse({
			GOOGLE_GENERATIVE_AI_API_KEY: "key",
			PAPER_TRADE: "false",
		});

		expect(result.PAPER_TRADE).toBe(false);
		expect(typeof result.PAPER_TRADE).toBe("boolean");
	});

	it("transforms CONFIDENCE_THRESHOLD='0.7' to number 0.7", () => {
		const result = envSchema.parse({
			GOOGLE_GENERATIVE_AI_API_KEY: "key",
			CONFIDENCE_THRESHOLD: "0.7",
		});

		expect(result.CONFIDENCE_THRESHOLD).toBe(0.7);
		expect(typeof result.CONFIDENCE_THRESHOLD).toBe("number");
	});

	it("fails when LOG_LEVEL is invalid", () => {
		const result = envSchema.safeParse({
			GOOGLE_GENERATIVE_AI_API_KEY: "key",
			LOG_LEVEL: "verbose",
		});

		expect(result.success).toBe(false);
	});

	it("applies default LOG_LEVEL of 'info'", () => {
		const result = envSchema.parse({
			GOOGLE_GENERATIVE_AI_API_KEY: "key",
		});

		expect(result.LOG_LEVEL).toBe("info");
	});

	it("applies default NODE_ENV of 'development'", () => {
		const result = envSchema.parse({
			GOOGLE_GENERATIVE_AI_API_KEY: "key",
		});

		expect(result.NODE_ENV).toBe("development");
	});
});
