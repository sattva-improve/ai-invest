import { Queue } from "bullmq";
import { logger } from "../lib/logger.js";
import { getRedisConnectionOptions } from "../lib/redis-client.js";
import type { AppConfig } from "../schemas/config.js";
import { FETCH_NEWS_QUEUE } from "./fetch-news-job.js";
import { FETCH_PRICE_QUEUE } from "./fetch-price-job.js";
import { SCALP_ANALYZE_QUEUE } from "./scalp-analyze-job.js";
import { STOP_LOSS_MONITOR_QUEUE } from "./stop-loss-monitor-job.js";

const log = logger.child({ module: "queue" });

export async function setupQueues(config: AppConfig): Promise<{
  newsQueue: Queue;
  priceQueue: Queue;
  scalpQueue: Queue | null;
  stopLossQueue: Queue | null;
}> {
  const connection = getRedisConnectionOptions();

  const newsQueue = new Queue(FETCH_NEWS_QUEUE, { connection });
  const priceQueue = new Queue(FETCH_PRICE_QUEUE, { connection });
  let scalpQueue: Queue | null = null;
  let stopLossQueue: Queue | null = null;

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

  if (config.scalpEnabled) {
    scalpQueue = new Queue(SCALP_ANALYZE_QUEUE, { connection });
    stopLossQueue = new Queue(STOP_LOSS_MONITOR_QUEUE, { connection });

    await scalpQueue.upsertJobScheduler(
      "scalp-analyze-repeat",
      { every: config.scalpIntervalMinutes * 60 * 1000 },
      { data: {} },
    );

    await stopLossQueue.upsertJobScheduler(
      "stop-loss-monitor-repeat",
      { every: config.scalpStoplossMonitorSeconds * 1000 },
      { data: {} },
    );
  }

  log.info(
    {
      newsInterval: config.fetchIntervalMinutes,
      priceInterval: config.priceIntervalMinutes,
      scalpEnabled: config.scalpEnabled,
      ...(config.scalpEnabled && {
        scalpInterval: config.scalpIntervalMinutes,
        stopLossInterval: config.scalpStoplossMonitorSeconds,
      }),
    },
    "Queues set up with repeatable jobs",
  );

  return { newsQueue, priceQueue, scalpQueue, stopLossQueue };
}

export async function teardownQueues(
  newsQueue: Queue,
  priceQueue: Queue,
  scalpQueue: Queue | null,
  stopLossQueue: Queue | null,
): Promise<void> {
  await newsQueue.close();
  await priceQueue.close();
  if (scalpQueue) await scalpQueue.close();
  if (stopLossQueue) await stopLossQueue.close();
  log.info("Queues closed");
}
