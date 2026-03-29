import ccxt from "ccxt";
import { env } from "../config/env.js";
import { cacheGet, cacheSet } from "./cache.js";
import { logger } from "./logger.js";

const CACHE_KEY = "rate:BTC/JPY";
const CACHE_TTL = 60;

export async function getBtcJpyRate(): Promise<number | null> {
  const cached = await cacheGet<number>(CACHE_KEY);
  if (cached !== null) return cached;

  try {
    const exchangeId = env.EXCHANGE_ID ?? "binance";
    // biome-ignore lint/suspicious/noExplicitAny: ccxt dynamic exchange instantiation
    const ExchangeClass = (ccxt as any)[exchangeId];
    if (!ExchangeClass) {
      throw new Error(`Exchange '${exchangeId}' not found in ccxt`);
    }
    const exchange = new ExchangeClass({ enableRateLimit: true });
    const ticker = await exchange.fetchTicker("BTC/JPY");
    const rate = ticker.last;

    if (!rate || rate <= 0) {
      logger.warn("BTC/JPY rate unavailable or invalid");
      return null;
    }

    await cacheSet(CACHE_KEY, rate, CACHE_TTL);
    logger.info({ rate }, "BTC/JPY rate fetched");
    return rate;
  } catch (error) {
    logger.warn({ error }, "Failed to fetch BTC/JPY rate");
    return null;
  }
}

export function convertToJpy(amount: number, currency: string, btcJpyRate?: number): number | null {
  if (currency === "JPY") return amount;
  if (currency === "BTC") {
    if (btcJpyRate == null || btcJpyRate <= 0) return null;
    return amount * btcJpyRate;
  }

  logger.warn({ currency }, "Cannot convert unknown currency to JPY");
  return null;
}

export function getQuoteCurrency(symbol: string): string {
  const parts = symbol.split("/");
  return parts.length === 2 ? parts[1] : "UNKNOWN";
}
