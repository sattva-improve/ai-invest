import yahooFinance from "yahoo-finance2";
import { cacheGet, cacheSet } from "../lib/cache.js";
import { logger } from "../lib/logger.js";
import { type MarketData, MarketDataSchema } from "../schemas/market.js";

const CACHE_TTL = 60; // 1 minute for stocks
const ETF_SYMBOLS = ["SPY", "QQQ", "VTI", "VOO", "IWM", "GLD", "TLT"];

const yf = new yahooFinance();

export async function getStockMarketData(symbol: string): Promise<MarketData | null> {
  const cacheKey = `market:stock:${symbol}`;
  const cached = await cacheGet<MarketData>(cacheKey);
  if (cached) {
    logger.debug({ symbol }, "Stock market data from cache");
    return cached;
  }

  try {
    const result = await yf.quote(symbol);
    const price = result.regularMarketPrice;
    const volume = result.regularMarketVolume ?? 0;
    const ts = result.regularMarketTime
      ? result.regularMarketTime.toISOString()
      : new Date().toISOString();

    if (price == null) {
      logger.warn({ symbol }, "No price returned from yahoo-finance2");
      return null;
    }

    const assetType: "stock" | "etf" = ETF_SYMBOLS.includes(symbol.toUpperCase()) ? "etf" : "stock";

    const data = MarketDataSchema.parse({
      symbol,
      price,
      rsi: undefined,
      volume,
      timestamp: ts,
      exchange: "yahoo",
      assetType,
    });

    await cacheSet(cacheKey, data, CACHE_TTL);
    logger.info({ symbol, price }, "Stock market data fetched");
    return data;
  } catch (error) {
    logger.warn({ error, symbol }, "Failed to fetch stock market data");
    return null;
  }
}
