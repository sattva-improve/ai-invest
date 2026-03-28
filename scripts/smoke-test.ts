/**
 * Smoke test: RSS取得 → AI分析 → DynamoDB保存 の一連フローを実際に実行して確認
 * Usage: tsx scripts/smoke-test.ts
 */
import { fetchNewsHandler } from "../src/handlers/fetch-news.js";
import { fetchPriceHandler } from "../src/handlers/fetch-price.js";
import { logger } from "../src/lib/logger.js";
import { AppConfigSchema } from "../src/schemas/config.js";

const log = logger.child({ script: "smoke-test" });

const config = AppConfigSchema.parse({
  rssFeeds: [
    // クリプト系ニュース（高速・安定）
    { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", enabled: true },
    { name: "Cointelegraph", url: "https://cointelegraph.com/rss", enabled: true },
  ],
  tradingPairs: [
    // 株価データ（API不要）
    { symbol: "AAPL", assetType: "stock", enabled: true },
    { symbol: "7203.T", assetType: "stock", enabled: true },
    { symbol: "NVDA", assetType: "stock", enabled: true },
  ],
  confidenceThreshold: 0.8,
  fetchIntervalMinutes: 60,
  priceIntervalMinutes: 5,
  maxOrderValueBtc: 0.001,
});

async function main() {
  log.info("=== Smoke Test Start ===");

  // Step 1: 株価データ取得
  log.info("--- Step 1: Price Fetch ---");
  try {
    const priceResult = await fetchPriceHandler(config);
    log.info(priceResult, "Price fetch result");
  } catch (err) {
    log.error({ err }, "Price fetch failed");
  }

  // Step 2: ニュース取得 + AI分析
  log.info("--- Step 2: News Fetch + AI Analysis ---");
  try {
    const newsResult = await fetchNewsHandler(config);
    log.info(newsResult, "News fetch result");
  } catch (err) {
    log.error({ err }, "News fetch/analysis failed");
  }

  log.info("=== Smoke Test Complete ===");
  process.exit(0);
}

main().catch((err) => {
  log.error({ err }, "Smoke test fatal error");
  process.exit(1);
});
