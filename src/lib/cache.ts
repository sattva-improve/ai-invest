import { logger } from "./logger.js";
import { getRedisClient, isRedisConfigured } from "./redis-client.js";

const DEFAULT_TTL = 3600; // 1 hour in seconds

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!isRedisConfigured()) return null;
  try {
    const redis = getRedisClient();
    const value = await redis.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    logger.warn({ error, key }, "Cache get failed");
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds = DEFAULT_TTL): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    const redis = getRedisClient();
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    logger.warn({ error, key }, "Cache set failed");
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch (error) {
    logger.warn({ error, key }, "Cache del failed");
  }
}

export async function cacheExists(key: string): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  try {
    const redis = getRedisClient();
    const result = await redis.exists(key);
    return result === 1;
  } catch (error) {
    logger.warn({ error, key }, "Cache exists check failed");
    return false;
  }
}
