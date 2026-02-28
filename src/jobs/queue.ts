import type { ConnectionOptions } from "bullmq";
import { Queue } from "bullmq";
import { logger } from "../lib/logger.js";
import { getRedisClient } from "../lib/redis-client.js";
import type { AppConfig } from "../schemas/config.js";
import { FETCH_NEWS_QUEUE } from "./fetch-news-job.js";
import { FETCH_PRICE_QUEUE } from "./fetch-price-job.js";

const log = logger.child({ module: "queue" });

export async function setupQueues(config: AppConfig): Promise<{
  newsQueue: Queue;
  priceQueue: Queue;
}> {
  const connection = getRedisClient() as ConnectionOptions;

  const newsQueue = new Queue(FETCH_NEWS_QUEUE, { connection });
  const priceQueue = new Queue(FETCH_PRICE_QUEUE, { connection });

  // BullMQ v5: use upsertJobScheduler for repeatable jobs
  await newsQueue.upsertJobScheduler(
    "fetch-news-repeat",
    { every: config.fetchIntervalMinutes * 60 * 1000 },
    { data: {} },
  );

  await priceQueue.upsertJobScheduler(
    "fetch-price-repeat",
    { every: config.priceIntervalMinutes * 60 * 1000 },
    { data: {} },
  );

  log.info(
    {
      newsInterval: config.fetchIntervalMinutes,
      priceInterval: config.priceIntervalMinutes,
    },
    "Queues set up with repeatable jobs",
  );

  return { newsQueue, priceQueue };
}

export async function teardownQueues(newsQueue: Queue, priceQueue: Queue): Promise<void> {
  await newsQueue.close();
  await priceQueue.close();
  log.info("Queues closed");
}
