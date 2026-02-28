import type { ConnectionOptions } from "bullmq";
import { Worker } from "bullmq";
import { fetchNewsHandler } from "../handlers/fetch-news.js";
import { logger } from "../lib/logger.js";
import { getRedisClient } from "../lib/redis-client.js";
import type { AppConfig } from "../schemas/config.js";

export const FETCH_NEWS_QUEUE = "fetch-news";

export function createFetchNewsWorker(config: AppConfig): Worker {
  const log = logger.child({ worker: FETCH_NEWS_QUEUE });

  const worker = new Worker(
    FETCH_NEWS_QUEUE,
    async (job) => {
      log.info({ jobId: job.id }, "Processing fetch-news job");
      const result = await fetchNewsHandler(config);
      log.info(result, "fetch-news job completed");
      return result;
    },
    {
      connection: getRedisClient() as ConnectionOptions,
      concurrency: 1,
    },
  );

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "fetch-news job failed");
  });

  return worker;
}
