const mockFetchOHLCV = vi.fn();

vi.mock("ccxt", () => ({
  default: {
    binance: vi.fn().mockImplementation(() => ({
      fetchOHLCV: mockFetchOHLCV,
    })),
  },
}));

const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
vi.mock("../../lib/cache.js", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
}));

vi.mock("../../config/env.js", () => ({
  env: {
    EXCHANGE_ID: "binance",
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
  },
}));

import { getCryptoMarketData } from "../crypto-market.js";

// Generate enough OHLCV data for RSI calculation (need > 15 candles)
function generateOhlcv(count: number, basePrice = 50000): number[][] {
  const data: number[][] = [];
  for (let i = 0; i < count; i++) {
    const ts = Date.now() - (count - i) * 3600000;
    const price = basePrice + (i % 3 === 0 ? 100 : -50);
    data.push([ts, price - 10, price + 10, price - 20, price, 1000 + i]);
  }
  return data;
}

describe("getCryptoMarketData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it("returns MarketData with correct symbol/price/RSI", async () => {
    const ohlcv = generateOhlcv(20);
    mockFetchOHLCV.mockResolvedValue(ohlcv);

    const result = await getCryptoMarketData("ETH/BTC");

    expect(result).not.toBeNull();
    expect(result?.symbol).toBe("ETH/BTC");
    expect(result?.price).toBe(ohlcv[ohlcv.length - 1][4]); // close price
    expect(result?.assetType).toBe("crypto");
    expect(typeof result?.rsi).toBe("number");
  });

  it("returns cached data when available", async () => {
    const cachedData = {
      symbol: "ETH/BTC",
      price: 51000,
      rsi: 55,
      volume: 2000,
      timestamp: "2026-01-01T00:00:00.000Z",
      exchange: "binance",
      assetType: "crypto",
    };
    mockCacheGet.mockResolvedValue(cachedData);

    const result = await getCryptoMarketData("ETH/BTC");

    expect(result).toEqual(cachedData);
    expect(mockFetchOHLCV).not.toHaveBeenCalled();
  });

  it("returns null on exchange error", async () => {
    mockFetchOHLCV.mockRejectedValue(new Error("Exchange timeout"));

    const result = await getCryptoMarketData("ETH/BTC");

    expect(result).toBeNull();
  });

  it("RSI is calculated from OHLCV (not null when enough data)", async () => {
    const ohlcv = generateOhlcv(30);
    mockFetchOHLCV.mockResolvedValue(ohlcv);

    const result = await getCryptoMarketData("ETH/BTC");

    expect(result).not.toBeNull();
    expect(result?.rsi).toBeDefined();
    expect(typeof result?.rsi).toBe("number");
    expect(result?.rsi).toBeGreaterThanOrEqual(0);
    expect(result?.rsi).toBeLessThanOrEqual(100);
  });

  it("caches fetched data", async () => {
    const ohlcv = generateOhlcv(20);
    mockFetchOHLCV.mockResolvedValue(ohlcv);

    await getCryptoMarketData("ETH/BTC");

    expect(mockCacheSet).toHaveBeenCalledTimes(1);
    expect(mockCacheSet.mock.calls[0][0]).toBe("market:crypto:ETH/BTC");
  });
});
