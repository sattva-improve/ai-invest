const mockSaveTradeItem = vi.fn().mockResolvedValue({});
const mockUpdateState = vi.fn().mockResolvedValue(undefined);

vi.mock("../../config/env.js", () => ({
	env: {
		PAPER_TRADE: true,
		EXCHANGE_ID: "binance",
		EXCHANGE_API_KEY: "",
		EXCHANGE_SECRET: "",
		LOG_LEVEL: "silent",
		NODE_ENV: "test",
	},
}));

vi.mock("../../repositories/trade-repository.js", () => ({
	saveTradeItem: (...args: unknown[]) => mockSaveTradeItem(...args),
}));

vi.mock("../../repositories/state-repository.js", () => ({
	updateState: (...args: unknown[]) => mockUpdateState(...args),
}));

import { executeTrade } from "../trader.js";
import type { OrderRequest } from "../../schemas/trade.js";
import type { InvestmentDecision } from "../../schemas/ai.js";
import type { AppConfig } from "../../schemas/config.js";

const testRequest: OrderRequest = {
	symbol: "BTC/USDT",
	side: "buy",
	amount: 0.002,
	price: 50000,
	type: "market",
};

const testDecision: InvestmentDecision = {
	ticker: "BTC/USDT",
	action: "BUY",
	confidence: 0.9,
	reasoning: "Strong bullish momentum",
	riskLevel: "MEDIUM",
	timeHorizon: "SHORT",
};

const testConfig: AppConfig = {
	rssFeeds: [{ name: "Test", url: "https://example.com/rss", enabled: true }],
	tradingPairs: [{ symbol: "BTC/USDT", exchange: "binance", assetType: "crypto", enabled: true }],
	confidenceThreshold: 0.8,
	fetchIntervalMinutes: 60,
	priceIntervalMinutes: 5,
	maxOrderValueUsd: 100,
};

describe("executeTrade", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("paper trade returns OrderResult with isPaperTrade=true and orderId starting with 'paper-'", async () => {
		const result = await executeTrade(testRequest, testConfig, testDecision);

		expect(result.isPaperTrade).toBe(true);
		expect(result.orderId).toMatch(/^paper-/);
		expect(result.symbol).toBe("BTC/USDT");
		expect(result.side).toBe("buy");
		expect(result.amount).toBe(0.002);
		expect(result.status).toBe("closed");
	});

	it("paper trade with no price throws ZodError (executedPrice must be positive)", async () => {
		const noPrice: OrderRequest = {
			symbol: "ETH/USDT",
			side: "sell",
			amount: 0.1,
			type: "market",
			// price is undefined → executedPrice = 0 → positive() validation fails
		};

		await expect(executeTrade(noPrice, testConfig, testDecision)).rejects.toThrow();
	});

	it("executeTrade calls saveTradeItem after execution", async () => {
		await executeTrade(testRequest, testConfig, testDecision);

		expect(mockSaveTradeItem).toHaveBeenCalledTimes(1);
		expect(mockSaveTradeItem).toHaveBeenCalledWith(
			expect.objectContaining({
				decision: testDecision,
				executedPrice: 50000,
				isPaper: true,
			}),
		);
	});

	it("executeTrade calls updateState after execution", async () => {
		await executeTrade(testRequest, testConfig, testDecision);

		expect(mockUpdateState).toHaveBeenCalledTimes(1);
		// tradeValue = executedPrice * amount = 50000 * 0.002 = 100
		expect(mockUpdateState).toHaveBeenCalledWith(100);
	});
});
