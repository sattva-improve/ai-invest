import ccxt from "ccxt";
import { env } from "../config/env.js";
import { cacheGet, cacheSet } from "../lib/cache.js";
import { logger } from "../lib/logger.js";
import { type MarketData, MarketDataSchema } from "../schemas/market.js";

const CACHE_TTL = 300; // 5 minutes
const SPOT_PRICE_CACHE_TTL = 30;

type SupportedExchange = {
  fetchOHLCV(
    symbol: string,
    timeframe?: string,
    since?: number,
    limit?: number,
  ): Promise<number[][]>;
  fetchTicker(
    symbol: string,
  ): Promise<{ last?: number; close?: number; baseVolume?: number; timestamp?: number }>;
};

type ExchangeConstructor = new (options: { enableRateLimit: boolean }) => SupportedExchange;

function createExchange(): SupportedExchange {
  const exchangeId = env.EXCHANGE_ID ?? "binance";
  const ExchangeClass = Reflect.get(ccxt as Record<string, unknown>, exchangeId);

  if (typeof ExchangeClass !== "function") {
    throw new Error(`Exchange '${exchangeId}' not found in ccxt`);
  }

  return new (ExchangeClass as ExchangeConstructor)({ enableRateLimit: true });
}

function getExchangeId(): string {
  return env.EXCHANGE_ID ?? "binance";
}

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

function calculateSma(closes: number[], period: number): number | undefined {
  if (closes.length < period) return undefined;
  const slice = closes.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

function calculateEma(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [];
  ema[0] = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = 1; i < values.length - period + 1; i++) {
    ema[i] = values[period - 1 + i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function calculateMacd(closes: number[]): { macd?: number; signal?: number; histogram?: number } {
  if (closes.length < 35) return {};
  const ema12 = calculateEma(closes, 12);
  const ema26 = calculateEma(closes, 26);
  const offset = ema12.length - ema26.length;
  const macdLine = ema26.map((val, i) => ema12[i + offset] - val);
  if (macdLine.length < 9) return {};
  const signalLine = calculateEma(macdLine, 9);
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  return { macd, signal, histogram: macd - signal };
}

function calculateBollingerBands(
  closes: number[],
  period = 20,
): { upper?: number; lower?: number } {
  if (closes.length < period) return {};
  const slice = closes.slice(-period);
  const mean = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  const stddev = Math.sqrt(variance);
  return { upper: mean + 2 * stddev, lower: mean - 2 * stddev };
}

export async function getCryptoMarketData(symbol: string): Promise<MarketData | null> {
  const cacheKey = `market:crypto:${symbol}`;
  const cached = await cacheGet<MarketData>(cacheKey);
  if (cached) {
    logger.debug({ symbol }, "Crypto market data from cache");
    return cached;
  }

  try {
    const exchangeId = getExchangeId();
    const exchange = createExchange();
    const ohlcv: number[][] = await exchange.fetchOHLCV(symbol, "1h", undefined, 100);
    if (!ohlcv || ohlcv.length === 0) return null;

    const latest = ohlcv[ohlcv.length - 1];
    const price = latest[4]; // close
    const volume = latest[5]; // volume
    const rsi = calculateRsi(ohlcv);
    const closes = ohlcv.map((c) => c[4]);
    const sma20 = calculateSma(closes, 20);
    const sma50 = calculateSma(closes, 50);
    const { macd, signal: macdSignal, histogram: macdHistogram } = calculateMacd(closes);
    const { upper: bollingerUpper, lower: bollingerLower } = calculateBollingerBands(closes);

    const data = MarketDataSchema.parse({
      symbol,
      price,
      rsi,
      sma20,
      sma50,
      macd,
      macdSignal,
      macdHistogram,
      bollingerUpper,
      bollingerLower,
      volume,
      timestamp: new Date(latest[0]).toISOString(),
      exchange: exchangeId,
      assetType: "crypto",
    });

    await cacheSet(cacheKey, data, CACHE_TTL);
    logger.info({ symbol, price, rsi, sma20, sma50, macd }, "Crypto market data fetched");
    return data;
  } catch (error) {
    logger.warn({ error, symbol }, "Failed to fetch crypto market data");
    return null;
  }
}

export async function getCryptoSpotPrice(symbol: string): Promise<number | null> {
  const cacheKey = `market:crypto:spot:${symbol}`;
  const cached = await cacheGet<number>(cacheKey);

  if (typeof cached === "number" && cached > 0) {
    logger.debug({ symbol, price: cached }, "Crypto spot price from cache");
    return cached;
  }

  try {
    const exchange = createExchange();
    const ticker = await exchange.fetchTicker(symbol);
    const price = ticker.last ?? ticker.close;

    if (typeof price !== "number" || price <= 0) {
      return null;
    }

    await cacheSet(cacheKey, price, SPOT_PRICE_CACHE_TTL);
    logger.info({ symbol, price }, "Crypto spot price fetched");
    return price;
  } catch (error) {
    logger.warn({ error, symbol }, "Failed to fetch crypto spot price");
    return null;
  }
}
