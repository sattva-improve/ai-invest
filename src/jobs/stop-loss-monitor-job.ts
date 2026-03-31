import { Worker } from "bullmq";
import { stopLossMonitorHandler } from "../handlers/stop-loss-monitor.js";
import { logger } from "../lib/logger.js";
import { getRedisConnectionOptions } from "../lib/redis-client.js";
import type { AppConfig } from "../schemas/config.js";

export const STOP_LOSS_MONITOR_QUEUE = "stop-loss-monitor";

export function createStopLossMonitorWorker(config: AppConfig): Worker {
  const log = logger.child({ worker: STOP_LOSS_MONITOR_QUEUE });

  const worker = new Worker(
    STOP_LOSS_MONITOR_QUEUE,
    async (job) => {
      log.info({ jobId: job.id }, "Processing stop-loss-monitor job");
      const result = await stopLossMonitorHandler(config);
      log.info(result, "stop-loss-monitor job completed");
      return result;
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 1,
    },
  );

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "stop-loss-monitor job failed");
  });

  return worker;
}
