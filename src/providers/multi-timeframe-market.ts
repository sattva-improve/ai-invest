import ccxt from "ccxt";
import { env } from "../config/env.js";
import { cacheGet, cacheSet } from "../lib/cache.js";
import { logger } from "../lib/logger.js";

const CACHE_TTL = 60;

export interface TimeframeData {
  timeframe: "1m" | "5m" | "15m" | "1h" | "1d";
  ohlcv: number[][];
  indicators: {
    rsi?: number;
    sma20?: number;
    sma50?: number;
    macd?: number;
    macdSignal?: number;
    macdHistogram?: number;
    bollingerUpper?: number;
    bollingerLower?: number;
    atr14?: number;
  };
  latestClose: number;
  latestVolume: number;
}

export interface MultiTimeframeData {
  symbol: string;
  timeframes: TimeframeData[];
  timestamp: string;
  exchange: string;
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

export function calculateAtr(ohlcv: number[][], period = 14): number | undefined {
  if (ohlcv.length < period + 1) return undefined;
  const trueRanges: number[] = [];
  for (let i = 1; i < ohlcv.length; i++) {
    const high = ohlcv[i][2];
    const low = ohlcv[i][3];
    const prevClose = ohlcv[i - 1][4];
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }
  return calculateSma(trueRanges, period);
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof ccxt.RateLimitExceeded) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("429")
  );
}

export async function fetchMultiTimeframeData(symbol: string): Promise<MultiTimeframeData | null> {
  const exchangeId = env.EXCHANGE_ID ?? "binance";
  // biome-ignore lint/suspicious/noExplicitAny: ccxt dynamic exchange instantiation
  const ExchangeClass = (ccxt as any)[exchangeId];
  if (!ExchangeClass) {
    logger.warn({ symbol, exchangeId }, "Exchange not found in ccxt");
    return null;
  }

  const exchange = new ExchangeClass({ enableRateLimit: true });
  const configs: Array<{ timeframe: TimeframeData["timeframe"]; limit: number }> = [
    { timeframe: "1m", limit: 100 },
    { timeframe: "5m", limit: 100 },
    { timeframe: "15m", limit: 100 },
    { timeframe: "1h", limit: 100 },
    { timeframe: "1d", limit: 50 },
  ];

  const timeframes: TimeframeData[] = [];

  for (const { timeframe, limit } of configs) {
    const cacheKey = `scalp:mtf:${symbol}:${timeframe}`;
    const cached = await cacheGet<TimeframeData>(cacheKey);
    if (cached) {
      timeframes.push(cached);
      continue;
    }

    try {
      const ohlcv = (await exchange.fetchOHLCV(symbol, timeframe, undefined, limit)) as number[][];
      if (!ohlcv || ohlcv.length === 0) {
        logger.warn({ symbol, timeframe }, "No OHLCV data returned");
        continue;
      }

      const latest = ohlcv[ohlcv.length - 1];
      const closes = ohlcv.map((c) => c[4]);
      const rsi = calculateRsi(ohlcv);
      const sma20 = calculateSma(closes, 20);
      const sma50 = calculateSma(closes, 50);
      const { macd, signal: macdSignal, histogram: macdHistogram } = calculateMacd(closes);
      const { upper: bollingerUpper, lower: bollingerLower } = calculateBollingerBands(closes);
      const atr14 = calculateAtr(ohlcv, 14);

      const timeframeData: TimeframeData = {
        timeframe,
        ohlcv,
        indicators: {
          rsi,
          sma20,
          sma50,
          macd,
          macdSignal,
          macdHistogram,
          bollingerUpper,
          bollingerLower,
          atr14,
        },
        latestClose: latest[4],
        latestVolume: latest[5],
      };

      await cacheSet(cacheKey, timeframeData, CACHE_TTL);
      timeframes.push(timeframeData);
    } catch (error) {
      if (isRateLimitError(error)) {
        logger.warn({ error, symbol, timeframe }, "Rate limit hit while fetching timeframe OHLCV");
        continue;
      }
      logger.warn({ error, symbol, timeframe }, "Failed to fetch timeframe OHLCV");
    }
  }

  if (timeframes.length === 0) return null;

  return {
    symbol,
    timeframes,
    timestamp: new Date().toISOString(),
    exchange: exchangeId,
  };
}
