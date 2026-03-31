import { Worker } from "bullmq";
import { scalpAnalyzeHandler } from "../handlers/scalp-analyze.js";
import { logger } from "../lib/logger.js";
import { getRedisConnectionOptions } from "../lib/redis-client.js";
import type { AppConfig } from "../schemas/config.js";

export const SCALP_ANALYZE_QUEUE = "scalp-analyze";

export function createScalpAnalyzeWorker(config: AppConfig): Worker {
  const log = logger.child({ worker: SCALP_ANALYZE_QUEUE });

  const worker = new Worker(
    SCALP_ANALYZE_QUEUE,
    async (job) => {
      log.info({ jobId: job.id }, "Processing scalp-analyze job");
      const result = await scalpAnalyzeHandler(config);
      log.info(result, "scalp-analyze job completed");
      return result;
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 1,
    },
  );

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "scalp-analyze job failed");
  });

  return worker;
}
