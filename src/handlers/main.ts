import { RSS_FEEDS } from "../config/rss-feeds.js";
import { TRADING_PAIRS } from "../config/trading-pairs.js";
import { createFetchNewsWorker } from "../jobs/fetch-news-job.js";
import { createFetchPriceWorker } from "../jobs/fetch-price-job.js";
import { setupQueues, teardownQueues } from "../jobs/queue.js";
import { logger } from "../lib/logger.js";
import { closeRedis } from "../lib/redis-client.js";
import type { AppConfig } from "../schemas/config.js";
import { AppConfigSchema } from "../schemas/config.js";

const log = logger.child({ handler: "main" });

// Default config for local execution
const defaultConfig: AppConfig = AppConfigSchema.parse({
  rssFeeds: RSS_FEEDS,
  tradingPairs: TRADING_PAIRS,
});

export async function main(): Promise<void> {
  log.info("Starting trading bot");

  const config = defaultConfig;

  // Start workers
  const newsWorker = createFetchNewsWorker(config);
  const priceWorker = createFetchPriceWorker(config);

  // Setup queues with repeatable jobs
  const { newsQueue, priceQueue } = await setupQueues(config);

  log.info("Trading bot started. Press Ctrl+C to stop.");

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    log.info("Shutting down...");
    await newsWorker.close();
    await priceWorker.close();
    await teardownQueues(newsQueue, priceQueue);
    await closeRedis();
    log.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => {
    shutdown().catch(log.error.bind(log));
  });
  process.on("SIGTERM", () => {
    shutdown().catch(log.error.bind(log));
  });
}

function isExecutedAsEntrypoint(): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  return import.meta.url === new URL(`file://${entryPath}`).href;
}

if (isExecutedAsEntrypoint()) {
  main().catch((err) => {
    log.error({ err }, "Fatal error in main");
    process.exit(1);
  });
}
