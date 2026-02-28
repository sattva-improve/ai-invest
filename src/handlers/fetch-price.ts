import type { ScheduledEvent, ScheduledHandler } from "aws-lambda";
import { RSS_FEEDS } from "../config/rss-feeds.js";
import { logger } from "../lib/logger.js";
import { getCryptoMarketData } from "../providers/crypto-market.js";
import { getStockMarketData } from "../providers/stock-market.js";
import { type AppConfig, AppConfigSchema } from "../schemas/config.js";

export interface FetchPriceHandlerResult {
  fetched: number;
  failed: number;
  symbols: string[];
}

export async function fetchPriceHandler(config: AppConfig): Promise<FetchPriceHandlerResult> {
  const log = logger.child({ handler: "fetch-price" });
  log.info("Starting price fetch cycle");

  const results: FetchPriceHandlerResult = {
    fetched: 0,
    failed: 0,
    symbols: [],
  };

  for (const pair of config.tradingPairs) {
    if (!pair.enabled) continue;

    try {
      let data = null;

      if (pair.assetType === "crypto") {
        data = await getCryptoMarketData(pair.symbol);
      } else {
        data = await getStockMarketData(pair.symbol);
      }

      if (data) {
        results.fetched++;
        results.symbols.push(pair.symbol);
      } else {
        results.failed++;
      }
    } catch (error) {
      log.warn({ error, symbol: pair.symbol }, "Failed to fetch market data");
      results.failed++;
    }
  }

  log.info(results, "Price fetch cycle completed");
  return results;
}

// --- AWS Lambda entry point ---
const defaultConfig = AppConfigSchema.parse({
  rssFeeds: RSS_FEEDS,
  tradingPairs: [
    { symbol: "BTC/USDT", assetType: "crypto", enabled: true },
    { symbol: "ETH/USDT", assetType: "crypto", enabled: true },
  ],
});

export const handler: ScheduledHandler = async (_event: ScheduledEvent) => {
  await fetchPriceHandler(defaultConfig);
};