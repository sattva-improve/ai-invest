import ccxt from "ccxt";
import { env } from "../config/env.js";
import { cacheGet, cacheSet } from "../lib/cache.js";
import { logger } from "../lib/logger.js";
import { type MarketData, MarketDataSchema } from "../schemas/market.js";

const CACHE_TTL = 300; // 5 minutes

function calculateRsi(ohlcv: number[][], period = 14): number | undefined {
  if (ohlcv.length < period + 1) return undefined;
  const closes = ohlcv.map((c) => c[4]);
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export async function getCryptoMarketData(symbol: string): Promise<MarketData | null> {
  const cacheKey = `market:crypto:${symbol}`;
  const cached = await cacheGet<MarketData>(cacheKey);
  if (cached) {
    logger.debug({ symbol }, "Crypto market data from cache");
    return cached;
  }

  try {
    const exchangeId = env.EXCHANGE_ID ?? "binance";
    // biome-ignore lint/suspicious/noExplicitAny: ccxt dynamic exchange instantiation
    const ExchangeClass = (ccxt as any)[exchangeId];
    if (!ExchangeClass) {
      throw new Error(`Exchange '${exchangeId}' not found in ccxt`);
    }
    const exchange = new ExchangeClass({ enableRateLimit: true });
    const ohlcv = (await exchange.fetchOHLCV(symbol, "1h", undefined, 50)) as number[][];
    if (!ohlcv || ohlcv.length === 0) return null;

    const latest = ohlcv[ohlcv.length - 1];
    const price = latest[4]; // close
    const volume = latest[5]; // volume
    const rsi = calculateRsi(ohlcv);

    const data = MarketDataSchema.parse({
      symbol,
      price,
      rsi,
      volume,
      timestamp: new Date(latest[0]).toISOString(),
      exchange: exchangeId,
      assetType: "crypto",
    });

    await cacheSet(cacheKey, data, CACHE_TTL);
    logger.info({ symbol, price, rsi }, "Crypto market data fetched");
    return data;
  } catch (error) {
    logger.warn({ error, symbol }, "Failed to fetch crypto market data");
    return null;
  }
}
