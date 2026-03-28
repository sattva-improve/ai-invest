const RedisConstructor = vi.fn();
const mockOn = vi.fn();
const mockQuit = vi.fn();

vi.mock("ioredis", () => ({
  Redis: function Redis(this: unknown) {
    RedisConstructor();
    return {
      on: (...args: unknown[]) => mockOn(...args),
      quit: (...args: unknown[]) => mockQuit(...args),
    };
  },
}));

vi.mock("../../config/env.js", () => ({
  env: {
    REDIS_URL: "redis://localhost:6379",
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    GITHUB_COPILOT_TOKEN: "test-token",
  },
}));

import { closeRedis, getRedisClient, getRedisConnectionOptions, isRedisConfigured } from "../redis-client.js";

describe("redis-client", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await closeRedis();
  });

  it("isRedisConfigured returns true when REDIS_URL is set", () => {
    expect(isRedisConfigured()).toBe(true);
  });

  it("getRedisClient creates singleton instance", () => {
    const a = getRedisClient();
    const b = getRedisClient();
    expect(a).toBe(b);
    expect(RedisConstructor).toHaveBeenCalledTimes(1);
    expect(mockOn).toHaveBeenCalled();
  });

  it("getRedisConnectionOptions parses REDIS_URL", () => {
    const opts = getRedisConnectionOptions();
    expect(opts.host).toBe("localhost");
    expect(opts.port).toBe(6379);
    expect(opts.maxRetriesPerRequest).toBeNull();
  });

  it("closeRedis quits and clears instance", async () => {
    getRedisClient();
    await closeRedis();
    expect(mockQuit).toHaveBeenCalledTimes(1);
    getRedisClient();
    expect(RedisConstructor).toHaveBeenCalledTimes(2);
  });
});
