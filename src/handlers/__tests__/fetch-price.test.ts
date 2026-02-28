const mockGetCryptoMarketData = vi.fn();
const mockGetStockMarketData = vi.fn();

vi.mock("../../providers/crypto-market.js", () => ({
  getCryptoMarketData: (...args: unknown[]) => mockGetCryptoMarketData(...args),
}));

vi.mock("../../providers/stock-market.js", () => ({
  getStockMarketData: (...args: unknown[]) => mockGetStockMarketData(...args),
}));

vi.mock("../../config/env.js", () => ({
  env: {
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
  },
}));

import { fetchPriceHandler } from "../fetch-price.js";
import type { AppConfig } from "../../schemas/config.js";

const testConfig: AppConfig = {
  rssFeeds: [{ name: "Test", url: "https://example.com/rss", enabled: true }],
  tradingPairs: [
    { symbol: "BTC/USDT", exchange: "binance", assetType: "crypto", enabled: true },
    { symbol: "AAPL", exchange: "yahoo", assetType: "stock", enabled: true },
    { symbol: "DISABLED", exchange: "binance", assetType: "crypto", enabled: false },
  ],
  confidenceThreshold: 0.8,
  fetchIntervalMinutes: 60,
  priceIntervalMinutes: 5,
  maxOrderValueUsd: 100,
};

describe("fetchPriceHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCryptoMarketData.mockResolvedValue({ symbol: "BTC/USDT", price: 1, rsi: 50, volume: 10, timestamp: 1 });
    mockGetStockMarketData.mockResolvedValue({ symbol: "AAPL", price: 1, timestamp: 1 });
  });

  it("fetches enabled crypto and stock pairs and returns counts", async () => {
    const result = await fetchPriceHandler(testConfig);

    expect(mockGetCryptoMarketData).toHaveBeenCalledTimes(1);
    expect(mockGetCryptoMarketData).toHaveBeenCalledWith("BTC/USDT");
    expect(mockGetStockMarketData).toHaveBeenCalledTimes(1);
    expect(mockGetStockMarketData).toHaveBeenCalledWith("AAPL");

    expect(result.fetched).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.symbols).toEqual(["BTC/USDT", "AAPL"]);
  });

  it("counts failures when provider throws or returns null", async () => {
    mockGetCryptoMarketData.mockRejectedValueOnce(new Error("crypto down"));
    mockGetStockMarketData.mockResolvedValueOnce(null);

    const result = await fetchPriceHandler(testConfig);

    expect(result.fetched).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.symbols).toEqual([]);
  });
});
