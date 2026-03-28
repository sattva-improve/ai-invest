const { mockQuote } = vi.hoisted(() => ({
  mockQuote: vi.fn(),
}));

vi.mock("yahoo-finance2", () => ({
  default: vi.fn().mockImplementation(() => ({
    quote: mockQuote,
  })),
}));

const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
vi.mock("../../lib/cache.js", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
}));

vi.mock("../../config/env.js", () => ({
  env: {
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
  },
}));

import { getStockMarketData } from "../stock-market.js";

describe("getStockMarketData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it("returns MarketData for a stock symbol", async () => {
    mockQuote.mockResolvedValue({
      regularMarketPrice: 150.5,
      regularMarketVolume: 1000000,
      regularMarketTime: new Date("2026-01-01"),
    });

    const result = await getStockMarketData("AAPL");

    expect(result).not.toBeNull();
    expect(result?.symbol).toBe("AAPL");
    expect(result?.price).toBe(150.5);
    expect(result?.volume).toBe(1000000);
    expect(result?.exchange).toBe("yahoo");
  });

  it("returns assetType='etf' for SPY", async () => {
    mockQuote.mockResolvedValue({
      regularMarketPrice: 450.0,
      regularMarketVolume: 5000000,
      regularMarketTime: new Date("2026-01-01"),
    });

    const result = await getStockMarketData("SPY");

    expect(result).not.toBeNull();
    expect(result?.assetType).toBe("etf");
  });

  it("returns assetType='stock' for AAPL", async () => {
    mockQuote.mockResolvedValue({
      regularMarketPrice: 150.5,
      regularMarketVolume: 1000000,
      regularMarketTime: new Date("2026-01-01"),
    });

    const result = await getStockMarketData("AAPL");

    expect(result).not.toBeNull();
    expect(result?.assetType).toBe("stock");
  });

  it("returns null when price is null", async () => {
    mockQuote.mockResolvedValue({
      regularMarketPrice: null,
      regularMarketVolume: 1000000,
      regularMarketTime: new Date("2026-01-01"),
    });

    const result = await getStockMarketData("UNKNOWN");

    expect(result).toBeNull();
  });

  it("returns cached data when available", async () => {
    const cachedData = {
      symbol: "AAPL",
      price: 150.5,
      volume: 1000000,
      timestamp: "2026-01-01T00:00:00.000Z",
      exchange: "yahoo",
      assetType: "stock",
    };
    mockCacheGet.mockResolvedValue(cachedData);

    const result = await getStockMarketData("AAPL");

    expect(result).toEqual(cachedData);
    expect(mockQuote).not.toHaveBeenCalled();
  });

  it("returns null on API error", async () => {
    mockQuote.mockRejectedValue(new Error("API error"));

    const result = await getStockMarketData("FAIL");

    expect(result).toBeNull();
  });
});
