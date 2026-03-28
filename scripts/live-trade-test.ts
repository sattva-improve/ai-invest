/**
 * Live trade test: RSS取得 → AI分析 → confidence > 0.8 なら Binance に実注文
 * Usage: npx tsx scripts/live-trade-test.ts
 */
import { env } from "../src/config/env.js";
import { fetchNewsHandler } from "../src/handlers/fetch-news.js";
import { logger } from "../src/lib/logger.js";
import { AppConfigSchema } from "../src/schemas/config.js";

const log = logger.child({ script: "live-trade-test" });

const config = AppConfigSchema.parse({
  rssFeeds: [
    { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", enabled: true },
    { name: "Cointelegraph", url: "https://cointelegraph.com/rss", enabled: true },
  ],
  tradingPairs: [
    { symbol: "ETH/BTC", assetType: "crypto", enabled: true },
    { symbol: "SOL/BTC", assetType: "crypto", enabled: true },
    { symbol: "XRP/BTC", assetType: "crypto", enabled: true },
    { symbol: "BNB/BTC", assetType: "crypto", enabled: true },
    { symbol: "ADA/BTC", assetType: "crypto", enabled: true },
    { symbol: "DOGE/BTC", assetType: "crypto", enabled: true },
    { symbol: "AVAX/BTC", assetType: "crypto", enabled: true },
    { symbol: "DOT/BTC", assetType: "crypto", enabled: true },
    { symbol: "LINK/BTC", assetType: "crypto", enabled: true },
  ],
  confidenceThreshold: 0.8,
  fetchIntervalMinutes: 60,
  priceIntervalMinutes: 5,
  maxOrderValueBtc: 0.0005,
});

async function main() {
  log.info("=== LIVE TRADE TEST START ===");
  log.info(
    {
      paperTrade: env.PAPER_TRADE,
      maxOrderValueBtc: 0.0005,
      confidenceThreshold: 0.8,
      exchange: env.EXCHANGE_ID,
    },
    "Configuration",
  );

  if (env.PAPER_TRADE) {
    log.warn("⚠️  PAPER_TRADE is still true — trades will be simulated, not real!");
  } else {
    log.info("🔴 LIVE TRADING MODE — real orders will be placed on Binance");
  }

  const result = await fetchNewsHandler(config);

  console.log("\n========================================");
  console.log("  LIVE TRADE TEST RESULTS");
  console.log("========================================");
  console.log(`Paper Trade:     ${env.PAPER_TRADE}`);
  console.log(`Articles found:  ${result.processed}`);
  console.log(`Skipped (dupe):  ${result.skipped}`);
  console.log(`Analyzed:        ${result.analyzed}`);
  console.log(`High confidence: ${result.highConfidence}`);
  console.log("========================================\n");

  process.exit(0);
}

main().catch((err) => {
  log.error({ err }, "Fatal error");
  process.exit(1);
});
