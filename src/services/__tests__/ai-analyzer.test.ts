const { mockGoogle } = vi.hoisted(() => ({
	mockGoogle: vi.fn(() => "mock-model"),
}));

const mockGenerateObject = vi.fn();

vi.mock("ai", () => ({
	generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../config/env.js", () => ({
	env: {
		GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
		CONFIDENCE_THRESHOLD: 0.8,
		LOG_LEVEL: "silent",
		NODE_ENV: "test",
	},
}));

vi.mock("@ai-sdk/google", () => ({
	createGoogleGenerativeAI: vi.fn(() => mockGoogle),
}));

import { analyzeNews } from "../ai-analyzer.js";
import type { NewsArticle } from "../../schemas/news.js";
import type { MarketData } from "../../schemas/market.js";

const testArticle: NewsArticle = {
	id: "test-id-1",
	title: "Bitcoin Surges Past $100K",
	url: "https://example.com/btc-surges",
	publishedAt: "2026-01-15T10:30:00.000Z",
	source: "CryptoNews",
	summary: "Bitcoin hits new all-time high",
};

const testMarketData: MarketData = {
	symbol: "BTC/USDT",
	price: 101000,
	rsi: 72,
	volume: 5000000,
	timestamp: "2026-01-15T10:30:00.000Z",
	exchange: "binance",
	assetType: "crypto",
};

const flashDecision = {
	ticker: "BTC/USDT",
	action: "BUY" as const,
	confidence: 0.6,
	reasoning: "Flash analysis: bullish",
	riskLevel: "MEDIUM" as const,
	timeHorizon: "SHORT" as const,
};

const highConfFlashDecision = {
	ticker: "BTC/USDT",
	action: "BUY" as const,
	confidence: 0.85,
	reasoning: "Flash analysis: very bullish",
	riskLevel: "LOW" as const,
	timeHorizon: "SHORT" as const,
};

const proDecision = {
	ticker: "BTC/USDT",
	action: "BUY" as const,
	confidence: 0.92,
	reasoning: "Pro analysis: confirmed bullish",
	riskLevel: "LOW" as const,
	timeHorizon: "MEDIUM" as const,
};

describe("analyzeNews", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns InvestmentDecision from Flash model", async () => {
		mockGenerateObject.mockResolvedValue({ object: flashDecision });

		const result = await analyzeNews({ article: testArticle });

		expect(result).toEqual(flashDecision);
		expect(mockGenerateObject).toHaveBeenCalledTimes(1);
	});

	it("upgrades to Pro model when confidence > 0.7 AND marketData provided", async () => {
		// First call (Flash) returns high confidence
		mockGenerateObject
			.mockResolvedValueOnce({ object: highConfFlashDecision })
			.mockResolvedValueOnce({ object: proDecision });

		const result = await analyzeNews({
			article: testArticle,
			marketData: testMarketData,
		});

		expect(result).toEqual(proDecision);
		expect(mockGenerateObject).toHaveBeenCalledTimes(2);
	});

	it("does NOT upgrade to Pro when marketData is null (even with high confidence)", async () => {
		mockGenerateObject.mockResolvedValue({ object: highConfFlashDecision });

		const result = await analyzeNews({
			article: testArticle,
			marketData: undefined,
		});

		expect(result).toEqual(highConfFlashDecision);
		// Should only call once (Flash), not twice
		expect(mockGenerateObject).toHaveBeenCalledTimes(1);
	});

	it("returns Flash result when confidence <= 0.7", async () => {
		mockGenerateObject.mockResolvedValue({ object: flashDecision });

		const result = await analyzeNews({
			article: testArticle,
			marketData: testMarketData,
		});

		expect(result).toEqual(flashDecision);
		expect(result.confidence).toBeLessThanOrEqual(0.7);
		expect(mockGenerateObject).toHaveBeenCalledTimes(1);
	});

	it("does NOT upgrade to Pro when useProModel is already true", async () => {
		// When useProModel is true, the condition !useProModel is false,
		// so no upgrade happens even with high confidence + marketData
		mockGenerateObject.mockResolvedValue({ object: highConfFlashDecision });

		const result = await analyzeNews({
			article: testArticle,
			marketData: testMarketData,
			useProModel: true,
		});

		expect(result).toEqual(highConfFlashDecision);
		expect(mockGenerateObject).toHaveBeenCalledTimes(1);
	});
});
