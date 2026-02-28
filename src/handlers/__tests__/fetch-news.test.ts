const mockFetchRssFeeds = vi.fn();
const mockAnalyzeNews = vi.fn();
const mockFindByUrl = vi.fn();
const mockSaveNewsItem = vi.fn();
const mockUpdateState = vi.fn();

vi.mock("../../providers/rss.js", () => ({
	fetchRssFeeds: (...args: unknown[]) => mockFetchRssFeeds(...args),
}));
vi.mock("../../services/ai-analyzer.js", () => ({
	analyzeNews: (...args: unknown[]) => mockAnalyzeNews(...args),
}));
vi.mock("../../repositories/news-repository.js", () => ({
	findByUrl: (...args: unknown[]) => mockFindByUrl(...args),
	saveNewsItem: (...args: unknown[]) => mockSaveNewsItem(...args),
}));
vi.mock("../../repositories/state-repository.js", () => ({
	updateState: (...args: unknown[]) => mockUpdateState(...args),
}));
vi.mock("../../config/env.js", () => ({
	env: {
		CONFIDENCE_THRESHOLD: 0.8,
		LOG_LEVEL: "silent",
		NODE_ENV: "test",
		GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
	},
}));

import { fetchNewsHandler } from "../fetch-news.js";
import type { AppConfig } from "../../schemas/config.js";

const testConfig: AppConfig = {
	rssFeeds: [{ name: "Test Feed", url: "https://example.com/rss", enabled: true }],
	tradingPairs: [{ symbol: "BTC/USDT", exchange: "binance", assetType: "crypto", enabled: true }],
	confidenceThreshold: 0.8,
	fetchIntervalMinutes: 60,
	priceIntervalMinutes: 5,
	maxOrderValueUsd: 100,
};

const testArticles = [
	{
		id: "uuid-1",
		title: "BTC Pumps",
		url: "https://example.com/btc-pumps",
		publishedAt: "2026-01-01T00:00:00.000Z",
		source: "CryptoNews",
	},
	{
		id: "uuid-2",
		title: "ETH Drops",
		url: "https://example.com/eth-drops",
		publishedAt: "2026-01-02T00:00:00.000Z",
		source: "CryptoNews",
	},
];

describe("fetchNewsHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchRssFeeds.mockResolvedValue(testArticles);
		mockSaveNewsItem.mockResolvedValue({});
		mockUpdateState.mockResolvedValue(undefined);
	});

	it("processes new articles (findByUrl returns null → analyzeNews called)", async () => {
		mockFindByUrl.mockResolvedValue(null);
		mockAnalyzeNews.mockResolvedValue({
			ticker: "BTC/USDT",
			action: "BUY",
			confidence: 0.6,
			reasoning: "Mildly bullish",
			riskLevel: "MEDIUM",
			timeHorizon: "SHORT",
		});

		const result = await fetchNewsHandler(testConfig);

		expect(mockAnalyzeNews).toHaveBeenCalledTimes(2);
		expect(result.analyzed).toBe(2);
		expect(result.skipped).toBe(0);
	});

	it("skips already-processed articles (findByUrl returns item → analyzeNews NOT called)", async () => {
		mockFindByUrl.mockResolvedValue({
			PK: "NEWS",
			SK: "2026-01-01T00:00:00.000Z#uuid-1",
			Url: "https://example.com/btc-pumps",
		});

		const result = await fetchNewsHandler(testConfig);

		expect(mockAnalyzeNews).not.toHaveBeenCalled();
		expect(result.skipped).toBe(2);
		expect(result.analyzed).toBe(0);
	});

	it("returns correct counts (processed, skipped, analyzed, highConfidence)", async () => {
		// First article is new, second is already processed
		mockFindByUrl
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ PK: "NEWS", Url: "https://example.com/eth-drops" });

		mockAnalyzeNews.mockResolvedValue({
			ticker: "BTC/USDT",
			action: "BUY",
			confidence: 0.6,
			reasoning: "test",
			riskLevel: "MEDIUM",
			timeHorizon: "SHORT",
		});

		const result = await fetchNewsHandler(testConfig);

		expect(result.processed).toBe(2);
		expect(result.skipped).toBe(1);
		expect(result.analyzed).toBe(1);
		expect(result.highConfidence).toBe(0);
	});

	it("high confidence signals (>0.8) increment highConfidence counter", async () => {
		mockFindByUrl.mockResolvedValue(null);
		mockAnalyzeNews.mockResolvedValue({
			ticker: "BTC/USDT",
			action: "BUY",
			confidence: 0.95,
			reasoning: "Very bullish",
			riskLevel: "LOW",
			timeHorizon: "SHORT",
		});

		const result = await fetchNewsHandler(testConfig);

		expect(result.highConfidence).toBe(2); // both articles > 0.8
		expect(result.analyzed).toBe(2);
	});
});
