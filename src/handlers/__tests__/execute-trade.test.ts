import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecuteTrade = vi.fn();
const mockGetLastTradeByTickerAndSide = vi.fn();
const mockGetAllPositions = vi.fn();
const mockGetBtcJpyRate = vi.fn();
const mockConvertToJpy = vi.fn();
const mockGetQuoteCurrency = vi.fn();

vi.mock("../../services/trader.js", () => ({
  executeTrade: (...args: unknown[]) => mockExecuteTrade(...args),
}));

vi.mock("../../repositories/trade-repository.js", () => ({
  getLastTradeByTickerAndSide: (...args: unknown[]) => mockGetLastTradeByTickerAndSide(...args),
}));

vi.mock("../../repositories/position-repository.js", () => ({
  getAllPositions: (...args: unknown[]) => mockGetAllPositions(...args),
}));

vi.mock("../../lib/currency-converter.js", () => ({
  getBtcJpyRate: (...args: unknown[]) => mockGetBtcJpyRate(...args),
  convertToJpy: (...args: unknown[]) => mockConvertToJpy(...args),
  getQuoteCurrency: (...args: unknown[]) => mockGetQuoteCurrency(...args),
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
  maxOrderValueJpy: 200,
  maxAllocationPercent: 0.05,
  maxLeverage: 3,
  marginMode: "isolated",
  enableShortSelling: false,
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
    mockGetLastTradeByTickerAndSide.mockResolvedValue(null);
    mockGetAllPositions.mockResolvedValue([]);
    mockGetQuoteCurrency.mockImplementation((symbol: string) => symbol.split("/")[1] ?? "UNKNOWN");
    mockConvertToJpy.mockImplementation((amount: number, currency: string, btcJpyRate?: number) => {
      if (currency === "JPY") return amount;
      if (currency === "BTC") return btcJpyRate ? amount * btcJpyRate : null;
      return null;
    });
    mockGetBtcJpyRate.mockResolvedValue(15000000);
  });

  it("skips trade when confidence < threshold", async () => {
    const decision: InvestmentDecision = {
      ticker: "ETH/BTC",
      action: "BUY",
      confidence: 0.7, // < 0.8 threshold
      positionSide: "LONG",
      leverage: 1,
      reasoning: "test",
      riskLevel: "MEDIUM",
      timeHorizon: "SHORT",
      promptVersion: "v1",
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
      positionSide: "LONG",
      leverage: 1,
      reasoning: "test",
      riskLevel: "MEDIUM",
      timeHorizon: "SHORT",
      promptVersion: "v1",
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
      positionSide: "LONG",
      leverage: 1,
      reasoning: "Very bullish",
      riskLevel: "LOW",
      timeHorizon: "SHORT",
      promptVersion: "v1",
      targetPrice: 0.035,
    };

    const result = await executeTradeHandler(decision, testConfig);

    expect(result).toEqual({ executed: 1, skipped: 0, errors: 0 });
    expect(mockExecuteTrade).toHaveBeenCalledTimes(1);
  });

  it("uses dynamic sizing based on confidence and portfolio value", async () => {
    const decision: InvestmentDecision = {
      ticker: "BTC/JPY",
      action: "BUY",
      confidence: 0.9,
      positionSide: "LONG",
      leverage: 1,
      reasoning: "Bullish",
      riskLevel: "LOW",
      timeHorizon: "SHORT",
      promptVersion: "v1",
      targetPrice: 10000000,
    };

    mockGetAllPositions.mockResolvedValue([
      {
        PK: "POSITION",
        SK: "BTC/JPY",
        type: "POSITION_ITEM",
        Ticker: "BTC/JPY",
        Amount: 0.1,
        AvgBuyPrice: 9000000,
        TotalInvested: 900000,
        Currency: "JPY",
        TotalInvestedJPY: 900000,
        UpdatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        PK: "POSITION",
        SK: "ETH/JPY",
        type: "POSITION_ITEM",
        Ticker: "ETH/JPY",
        Amount: 1,
        AvgBuyPrice: 100000,
        TotalInvested: 100000,
        Currency: "JPY",
        TotalInvestedJPY: 100000,
        UpdatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const result = await executeTradeHandler(decision, testConfig);

    expect(result).toEqual({ executed: 1, skipped: 0, errors: 0 });
    const orderRequest = mockExecuteTrade.mock.calls[0][0];
    expect(orderRequest.amount).toBeCloseTo((0.9 * 0.05 * 1_000_000) / 10_000_000, 12);
  });

  it("uses MIN_PORTFOLIO_JPY when portfolio is empty", async () => {
    const decision: InvestmentDecision = {
      ticker: "BTC/JPY",
      action: "BUY",
      confidence: 0.9,
      positionSide: "LONG",
      leverage: 1,
      reasoning: "Bullish",
      riskLevel: "LOW",
      timeHorizon: "SHORT",
      promptVersion: "v1",
      targetPrice: 10000000,
    };

    mockGetAllPositions.mockResolvedValue([]);

    const result = await executeTradeHandler(decision, testConfig);

    expect(result).toEqual({ executed: 1, skipped: 0, errors: 0 });
    const orderRequest = mockExecuteTrade.mock.calls[0][0];
    expect(orderRequest.amount).toBeCloseTo((0.9 * 0.05 * 10000) / 10000000, 12);
  });

  it("skips BTC pair trade when BTC/JPY rate unavailable for sizing", async () => {
    const decision: InvestmentDecision = {
      ticker: "ETH/BTC",
      action: "BUY",
      confidence: 0.9,
      positionSide: "LONG",
      leverage: 1,
      reasoning: "Bullish",
      riskLevel: "LOW",
      timeHorizon: "SHORT",
      promptVersion: "v1",
      targetPrice: 0.03,
    };

    mockGetBtcJpyRate.mockResolvedValue(null);

    const result = await executeTradeHandler(decision, testConfig);

    expect(result).toEqual({ executed: 0, skipped: 1, errors: 0 });
    expect(mockExecuteTrade).not.toHaveBeenCalled();
  });

  it("executes trade when action is SELL", async () => {
    const decision: InvestmentDecision = {
      ticker: "ETH/BTC",
      action: "SELL",
      confidence: 0.85,
      positionSide: "LONG",
      leverage: 1,
      reasoning: "Bearish signal",
      riskLevel: "HIGH",
      timeHorizon: "SHORT",
      promptVersion: "v1",
      targetPrice: 0.033,
    };

    mockGetLastTradeByTickerAndSide.mockResolvedValue({
      PK: "TRADE",
      SK: "2026-01-01T00:00:00.000Z#paper-100",
      type: "TRADE_ITEM",
      Ticker: "ETH/BTC",
      Side: "BUY",
      Price: 0.03,
      CreatedAt: "2026-01-01T00:00:00.000Z",
    });

    mockExecuteTrade.mockResolvedValue({
      ...paperTradeResult,
      side: "sell",
    });

    const result = await executeTradeHandler(decision, testConfig);

    expect(result).toEqual({ executed: 1, skipped: 0, errors: 0 });
    expect(mockExecuteTrade).toHaveBeenCalledTimes(1);
  });

  it("SELL on BTC pair converts profit to JPY", async () => {
    const decision: InvestmentDecision = {
      ticker: "ETH/BTC",
      action: "SELL",
      confidence: 0.9,
      positionSide: "LONG",
      leverage: 1,
      reasoning: "Take profit",
      riskLevel: "LOW",
      timeHorizon: "SHORT",
      promptVersion: "v1",
      targetPrice: 0.033,
    };

    mockGetLastTradeByTickerAndSide.mockResolvedValue({
      PK: "TRADE",
      SK: "2026-01-01T00:00:00.000Z#paper-100",
      type: "TRADE_ITEM",
      Ticker: "ETH/BTC",
      Side: "BUY",
      Price: 0.03,
      CreatedAt: "2026-01-01T00:00:00.000Z",
    });

    await executeTradeHandler(decision, testConfig);

    expect(mockGetBtcJpyRate).toHaveBeenCalledTimes(2);
    expect(mockConvertToJpy).toHaveBeenCalledWith(0.0030000000000000027, "BTC", 15000000);
    const profitInfo = mockExecuteTrade.mock.calls[0][3];
    expect(profitInfo.currency).toBe("BTC");
    expect(profitInfo.conversionRate).toBe(15000000);
    expect(profitInfo.profit).toBeCloseTo(45000, 6);
    expect(profitInfo.profitJpy).toBeCloseTo(45000, 6);
  });

  it("SELL on JPY pair keeps profit in JPY", async () => {
    const decision: InvestmentDecision = {
      ticker: "BTC/JPY",
      action: "SELL",
      confidence: 0.9,
      positionSide: "LONG",
      leverage: 1,
      reasoning: "Take profit",
      riskLevel: "LOW",
      timeHorizon: "SHORT",
      promptVersion: "v1",
      targetPrice: 15100000,
    };

    mockGetLastTradeByTickerAndSide.mockResolvedValue({
      PK: "TRADE",
      SK: "2026-01-01T00:00:00.000Z#paper-100",
      type: "TRADE_ITEM",
      Ticker: "BTC/JPY",
      Side: "BUY",
      Price: 15000000,
      CreatedAt: "2026-01-01T00:00:00.000Z",
    });

    await executeTradeHandler(decision, testConfig, 15100000);

    expect(mockGetBtcJpyRate).not.toHaveBeenCalled();
    const profitInfo = mockExecuteTrade.mock.calls[0][3];
    expect(profitInfo.profit).toBe(100000);
    expect(profitInfo.profitJpy).toBe(100000);
    expect(profitInfo.currency).toBe("JPY");
  });

  it("SELL on BTC pair when profit conversion rate unavailable falls back to raw profit", async () => {
    const decision: InvestmentDecision = {
      ticker: "ETH/BTC",
      action: "SELL",
      confidence: 0.9,
      positionSide: "LONG",
      leverage: 1,
      reasoning: "Take profit",
      riskLevel: "LOW",
      timeHorizon: "SHORT",
      promptVersion: "v1",
      targetPrice: 0.033,
    };

    mockGetLastTradeByTickerAndSide.mockResolvedValue({
      PK: "TRADE",
      SK: "2026-01-01T00:00:00.000Z#paper-100",
      type: "TRADE_ITEM",
      Ticker: "ETH/BTC",
      Side: "BUY",
      Price: 0.03,
      CreatedAt: "2026-01-01T00:00:00.000Z",
    });
    mockGetBtcJpyRate.mockResolvedValueOnce(15000000).mockResolvedValueOnce(null);

    await executeTradeHandler(decision, testConfig);

    const profitInfo = mockExecuteTrade.mock.calls[0][3];
    expect(profitInfo.profit).toBeCloseTo(0.003, 12);
    expect(profitInfo.profitJpy).toBeUndefined();
    expect(profitInfo.currency).toBe("BTC");
    expect(profitInfo.conversionRate).toBeUndefined();
  });

  it("skips when targetPrice is 0 or missing (cannot calculate amount)", async () => {
    const decision: InvestmentDecision = {
      ticker: "ETH/BTC",
      action: "BUY",
      confidence: 0.9,
      positionSide: "LONG",
      leverage: 1,
      reasoning: "Bullish",
      riskLevel: "MEDIUM",
      timeHorizon: "SHORT",
      promptVersion: "v1",
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
      positionSide: "LONG",
      leverage: 1,
      reasoning: "Bullish",
      riskLevel: "MEDIUM",
      timeHorizon: "SHORT",
      promptVersion: "v1",
      targetPrice: 0.035,
    };

    mockExecuteTrade.mockRejectedValue(new Error("Exchange error"));

    const result = await executeTradeHandler(decision, testConfig);

    expect(result).toEqual({ executed: 0, skipped: 0, errors: 1 });
  });

  it("executes BUY even when previous SELL exists at lower price", async () => {
    const decision: InvestmentDecision = {
      ticker: "ETH/BTC",
      action: "BUY",
      confidence: 0.92,
      positionSide: "LONG",
      leverage: 1,
      reasoning: "Re-entry after sell",
      riskLevel: "MEDIUM",
      timeHorizon: "SHORT",
      promptVersion: "v1",
      targetPrice: 0.04,
    };

    mockGetLastTradeByTickerAndSide.mockResolvedValue({
      PK: "TRADE",
      SK: "2026-01-01T00:00:00.000Z#paper-200",
      type: "TRADE_ITEM",
      Ticker: "ETH/BTC",
      Side: "SELL",
      Price: 0.035,
      CreatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await executeTradeHandler(decision, testConfig);

    expect(result).toEqual({ executed: 1, skipped: 0, errors: 0 });
    expect(mockExecuteTrade).toHaveBeenCalledTimes(1);
  });
});
