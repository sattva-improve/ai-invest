import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
});

export type Logger = typeof logger;

export type LogContext = {
  requestId?: string;
  ticker?: string;
  jobId?: string;
  handler?: string;
  service?: string;
  worker?: string;
  [key: string]: unknown;
};

export function createLogger(context: LogContext) {
  return logger.child(context);
}
