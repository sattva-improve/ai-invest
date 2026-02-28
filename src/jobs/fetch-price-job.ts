import type { ConnectionOptions } from "bullmq";
import { Worker } from "bullmq";
import { fetchPriceHandler } from "../handlers/fetch-price.js";
import { logger } from "../lib/logger.js";
import { getRedisClient } from "../lib/redis-client.js";
import type { AppConfig } from "../schemas/config.js";

export const FETCH_PRICE_QUEUE = "fetch-price";

export function createFetchPriceWorker(config: AppConfig): Worker {
  const log = logger.child({ worker: FETCH_PRICE_QUEUE });

  const worker = new Worker(
    FETCH_PRICE_QUEUE,
    async (job) => {
      log.info({ jobId: job.id }, "Processing fetch-price job");
      const result = await fetchPriceHandler(config);
      log.info(result, "fetch-price job completed");
      return result;
    },
    {
      connection: getRedisClient() as ConnectionOptions,
      concurrency: 1,
    },
  );

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "fetch-price job failed");
  });

  return worker;
}
