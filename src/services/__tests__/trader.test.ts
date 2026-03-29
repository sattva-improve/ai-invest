import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSaveTradeItem = vi.fn().mockResolvedValue({});
const mockUpdateState = vi.fn().mockResolvedValue(undefined);
const mockAddToPosition = vi.fn().mockResolvedValue({});
const mockReducePosition = vi.fn().mockResolvedValue({});
const mockGetBtcJpyRate = vi.fn();
const mockConvertToJpy = vi.fn();
const mockGetQuoteCurrency = vi.fn();

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

vi.mock("../../repositories/position-repository.js", () => ({
  addToPosition: (...args: unknown[]) => mockAddToPosition(...args),
  reducePosition: (...args: unknown[]) => mockReducePosition(...args),
}));

vi.mock("../../lib/currency-converter.js", () => ({
  getBtcJpyRate: (...args: unknown[]) => mockGetBtcJpyRate(...args),
  convertToJpy: (...args: unknown[]) => mockConvertToJpy(...args),
  getQuoteCurrency: (...args: unknown[]) => mockGetQuoteCurrency(...args),
}));

import type { InvestmentDecision } from "../../schemas/ai.js";
import type { AppConfig } from "../../schemas/config.js";
import type { OrderRequest } from "../../schemas/trade.js";
import { executeTrade } from "../trader.js";

const testRequest: OrderRequest = {
  symbol: "ETH/BTC",
  side: "buy",
  amount: 0.5,
  price: 0.035,
  type: "market",
  positionSide: "long",
  leverage: 1,
  marginMode: "isolated",
};

const testDecision: InvestmentDecision = {
  ticker: "ETH/BTC",
  action: "BUY",
  positionSide: "LONG",
  leverage: 1,
  confidence: 0.9,
  reasoning: "Strong bullish momentum",
  riskLevel: "MEDIUM",
  timeHorizon: "SHORT",
  promptVersion: "v1",
};

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

describe("executeTrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetQuoteCurrency.mockReturnValue("BTC");
    mockGetBtcJpyRate.mockResolvedValue(15000000);
    mockConvertToJpy.mockImplementation((amount: number, currency: string, btcJpyRate?: number) => {
      if (currency === "JPY") return amount;
      if (currency === "BTC") return btcJpyRate ? amount * btcJpyRate : null;
      return null;
    });
  });

  it("paper trade returns OrderResult with isPaperTrade=true and orderId starting with 'paper-'", async () => {
    const result = await executeTrade(testRequest, testConfig, testDecision);

    expect(result.isPaperTrade).toBe(true);
    expect(result.orderId).toMatch(/^paper-/);
    expect(result.symbol).toBe("ETH/BTC");
    expect(result.side).toBe("buy");
    expect(result.amount).toBe(0.5);
    expect(result.status).toBe("closed");
  });

  it("paper trade with no price throws ZodError (executedPrice must be positive)", async () => {
    const noPrice: OrderRequest = {
      symbol: "SOL/BTC",
      side: "sell",
      amount: 0.1,
      type: "market",
      positionSide: "long",
      leverage: 1,
      marginMode: "isolated",
      // price is undefined → executedPrice = 0 → positive() validation fails
    };

    await expect(executeTrade(noPrice, testConfig, testDecision)).rejects.toThrow();
  });

  it("executeTrade calls saveTradeItem after execution", async () => {
    await executeTrade(testRequest, testConfig, testDecision, {
      profit: 100,
      currency: "JPY",
      profitJpy: 100,
      conversionRate: 1,
    });

    expect(mockSaveTradeItem).toHaveBeenCalledTimes(1);
    expect(mockSaveTradeItem).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: testDecision,
        executedPrice: 0.035,
        isPaper: true,
        currency: "JPY",
        profit: 100,
        profitJpy: 100,
        conversionRate: 1,
      }),
    );
  });

  it("executeTrade calls updateState after execution", async () => {
    await executeTrade(testRequest, testConfig, testDecision);

    expect(mockUpdateState).toHaveBeenCalledTimes(1);
    // tradeValue = executedPrice * amount = 0.035 * 0.5 = 0.0175
    expect(mockUpdateState).toHaveBeenCalledWith(0.0175);
  });

  it("BUY trade calls addToPosition with correct args", async () => {
    await executeTrade(testRequest, testConfig, testDecision);

    expect(mockAddToPosition).toHaveBeenCalledTimes(1);
    expect(mockAddToPosition).toHaveBeenCalledWith("ETH/BTC", 0.5, 0.035, "BTC", 262500);
    expect(mockReducePosition).not.toHaveBeenCalled();
  });

  it("SELL trade calls reducePosition with correct args", async () => {
    const sellRequest: OrderRequest = {
      symbol: "ETH/BTC",
      side: "sell",
      amount: 0.25,
      price: 0.034,
      type: "market",
      positionSide: "long",
      leverage: 1,
      marginMode: "isolated",
    };
    const sellDecision: InvestmentDecision = {
      ...testDecision,
      action: "SELL",
    };

    await executeTrade(sellRequest, testConfig, sellDecision);

    expect(mockReducePosition).toHaveBeenCalledTimes(1);
    expect(mockReducePosition).toHaveBeenCalledWith("ETH/BTC", 0.25);
    expect(mockAddToPosition).not.toHaveBeenCalled();
  });

  it("position tracking failure does not prevent trade completion", async () => {
    mockAddToPosition.mockRejectedValueOnce(new Error("position write failed"));

    const result = await executeTrade(testRequest, testConfig, testDecision);

    expect(result.orderId).toMatch(/^paper-/);
    expect(result.isPaperTrade).toBe(true);
    expect(mockSaveTradeItem).toHaveBeenCalledTimes(1);
    expect(mockUpdateState).toHaveBeenCalledTimes(1);
  });
});
