const mockExecuteTrade = vi.fn();

vi.mock("../../services/trader.js", () => ({
  executeTrade: (...args: unknown[]) => mockExecuteTrade(...args),
}));

vi.mock("../../config/env.js", () => ({
  env: {
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    GITHUB_COPILOT_TOKEN: "test-token",
  },
}));

import type { InvestmentDecision } from "../../schemas/ai.js";
import type { AppConfig } from "../../schemas/config.js";
import { executeTradeHandler } from "../execute-trade.js";

const testConfig: AppConfig = {
  rssFeeds: [{ name: "Test", url: "https://example.com/rss", enabled: true }],
  tradingPairs: [{ symbol: "ETH/BTC", exchange: "binance", assetType: "crypto", enabled: true }],
  confidenceThreshold: 0.8,
  fetchIntervalMinutes: 60,
  priceIntervalMinutes: 5,
  maxOrderValueBtc: 0.001,
};

const paperTradeResult = {
  orderId: "paper-123",
  symbol: "ETH/BTC",
  side: "buy" as const,
  amount: 0.001,
  executedPrice: 0.035,
  status: "closed" as const,
  timestamp: "2026-01-01T00:00:00.000Z",
  isPaperTrade: true,
};

describe("executeTradeHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteTrade.mockResolvedValue(paperTradeResult);
  });

  it("skips trade when confidence < threshold", async () => {
    const decision: InvestmentDecision = {
      ticker: "ETH/BTC",
      action: "BUY",
      confidence: 0.7, // < 0.8 threshold
      reasoning: "test",
      riskLevel: "MEDIUM",
      timeHorizon: "SHORT",
      targetPrice: 0.035,
    };

    const result = await executeTradeHandler(decision, testConfig);

    expect(result).toEqual({ executed: 0, skipped: 1, errors: 0 });
    expect(mockExecuteTrade).not.toHaveBeenCalled();
  });

  it("skips trade when action is HOLD", async () => {
    const decision: InvestmentDecision = {
      ticker: "ETH/BTC",
      action: "HOLD",
      confidence: 0.95,
      reasoning: "test",
      riskLevel: "MEDIUM",
      timeHorizon: "SHORT",
    };

    const result = await executeTradeHandler(decision, testConfig);

    expect(result).toEqual({ executed: 0, skipped: 1, errors: 0 });
    expect(mockExecuteTrade).not.toHaveBeenCalled();
  });

  it("executes trade when confidence >= threshold and action is BUY", async () => {
    const decision: InvestmentDecision = {
      ticker: "ETH/BTC",
      action: "BUY",
      confidence: 0.9,
      reasoning: "Very bullish",
      riskLevel: "LOW",
      timeHorizon: "SHORT",
      targetPrice: 0.035,
    };

    const result = await executeTradeHandler(decision, testConfig);

    expect(result).toEqual({ executed: 1, skipped: 0, errors: 0 });
    expect(mockExecuteTrade).toHaveBeenCalledTimes(1);
  });

  it("executes trade when action is SELL", async () => {
    const decision: InvestmentDecision = {
      ticker: "ETH/BTC",
      action: "SELL",
      confidence: 0.85,
      reasoning: "Bearish signal",
      riskLevel: "HIGH",
      timeHorizon: "SHORT",
      targetPrice: 0.033,
    };

    mockExecuteTrade.mockResolvedValue({
      ...paperTradeResult,
      side: "sell",
    });

    const result = await executeTradeHandler(decision, testConfig);

    expect(result).toEqual({ executed: 1, skipped: 0, errors: 0 });
    expect(mockExecuteTrade).toHaveBeenCalledTimes(1);
  });

  it("skips when targetPrice is 0 or missing (cannot calculate amount)", async () => {
    const decision: InvestmentDecision = {
      ticker: "ETH/BTC",
      action: "BUY",
      confidence: 0.9,
      reasoning: "Bullish",
      riskLevel: "MEDIUM",
      timeHorizon: "SHORT",
      // targetPrice is undefined
    };

    const result = await executeTradeHandler(decision, testConfig);

    expect(result).toEqual({ executed: 0, skipped: 1, errors: 0 });
    expect(mockExecuteTrade).not.toHaveBeenCalled();
  });

  it("returns errors=1 when executeTrade throws", async () => {
    const decision: InvestmentDecision = {
      ticker: "ETH/BTC",
      action: "BUY",
      confidence: 0.9,
      reasoning: "Bullish",
      riskLevel: "MEDIUM",
      timeHorizon: "SHORT",
      targetPrice: 0.035,
    };

    mockExecuteTrade.mockRejectedValue(new Error("Exchange error"));

    const result = await executeTradeHandler(decision, testConfig);

    expect(result).toEqual({ executed: 0, skipped: 0, errors: 1 });
  });
});
