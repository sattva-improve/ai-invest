import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
	if (!redisInstance) {
		redisInstance = new Redis(env.REDIS_URL, {
			maxRetriesPerRequest: 3,
			retryStrategy(times) {
				if (times > 3) {
					logger.error("Redis connection failed after 3 retries");
					return null;
				}
				return Math.min(times * 100, 3000);
			},
			lazyConnect: true,
		});

		redisInstance.on("error", (error) => {
			logger.error({ error }, "Redis client error");
		});

		redisInstance.on("connect", () => {
			logger.info("Redis connected");
		});
	}

	return redisInstance;
}
export function getRedisConnectionOptions(): { host: string; port: number; maxRetriesPerRequest: null } {
	const url = new URL(env.REDIS_URL);
	return {
		host: url.hostname,
		port: Number(url.port) || 6379,
		maxRetriesPerRequest: null,
	};
}

export async function closeRedis(): Promise<void> {
	if (redisInstance) {
		await redisInstance.quit();
		redisInstance = null;
		logger.info("Redis connection closed");
	}
}
