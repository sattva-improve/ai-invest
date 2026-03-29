import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCacheGet, mockCacheSet, mockWarn, mockInfo, mockFetchTicker, mockExchangeConstructor } =
  vi.hoisted(() => {
    const localMockCacheGet = vi.fn();
    const localMockCacheSet = vi.fn();
    const localMockWarn = vi.fn();
    const localMockInfo = vi.fn();
    const localMockFetchTicker = vi.fn();
    const localMockExchangeConstructor = vi.fn().mockImplementation(() => ({
      fetchTicker: localMockFetchTicker,
    }));

    return {
      mockCacheGet: localMockCacheGet,
      mockCacheSet: localMockCacheSet,
      mockWarn: localMockWarn,
      mockInfo: localMockInfo,
      mockFetchTicker: localMockFetchTicker,
      mockExchangeConstructor: localMockExchangeConstructor,
    };
  });

vi.mock("ccxt", () => ({
  default: {
    binance: mockExchangeConstructor,
  },
}));

vi.mock("../../config/env.js", () => ({
  env: {
    EXCHANGE_ID: "binance",
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
  },
}));

vi.mock("../../lib/cache.js", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
}));

vi.mock("../../lib/logger.js", () => ({
  logger: {
    warn: (...args: unknown[]) => mockWarn(...args),
    info: (...args: unknown[]) => mockInfo(...args),
  },
}));

import { convertToJpy, getBtcJpyRate, getQuoteCurrency } from "../currency-converter.js";

describe("convertToJpy", () => {
  it("returns amount unchanged for JPY", () => {
    expect(convertToJpy(1000, "JPY", 12345)).toBe(1000);
  });

  it("converts BTC amount using provided rate", () => {
    expect(convertToJpy(0.01, "BTC", 10000000)).toBe(100000);
  });

  it("returns null for BTC when rate is missing", () => {
    expect(convertToJpy(0.01, "BTC", undefined)).toBeNull();
  });

  it("returns null for BTC when rate is zero", () => {
    expect(convertToJpy(0.01, "BTC", 0)).toBeNull();
  });

  it("returns null for unknown currency", () => {
    expect(convertToJpy(100, "USDT", 150)).toBeNull();
  });
});

describe("getQuoteCurrency", () => {
  it("parses quote currencies correctly", () => {
    expect(getQuoteCurrency("BTC/JPY")).toBe("JPY");
    expect(getQuoteCurrency("ETH/BTC")).toBe("BTC");
    expect(getQuoteCurrency("INVALID")).toBe("UNKNOWN");
  });
});

describe("getBtcJpyRate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached value when available", async () => {
    mockCacheGet.mockResolvedValue(12345678);

    const result = await getBtcJpyRate();

    expect(result).toBe(12345678);
    expect(mockExchangeConstructor).not.toHaveBeenCalled();
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it("fetches from exchange and caches when cache misses", async () => {
    mockCacheGet.mockResolvedValue(null);
    mockFetchTicker.mockResolvedValue({ last: 15000000 });
    mockCacheSet.mockResolvedValue(undefined);

    const result = await getBtcJpyRate();

    expect(result).toBe(15000000);
    expect(mockExchangeConstructor).toHaveBeenCalledWith({ enableRateLimit: true });
    expect(mockFetchTicker).toHaveBeenCalledWith("BTC/JPY");
    expect(mockCacheSet).toHaveBeenCalledWith("rate:BTC/JPY", 15000000, 60);
  });

  it("returns null on exchange error", async () => {
    mockCacheGet.mockResolvedValue(null);
    mockFetchTicker.mockRejectedValue(new Error("boom"));

    const result = await getBtcJpyRate();

    expect(result).toBeNull();
  });
});
