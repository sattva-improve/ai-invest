const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockExists = vi.fn();

vi.mock("../../lib/redis-client.js", () => ({
  isRedisConfigured: () => true,
  getRedisClient: () => ({
    get: mockGet,
    set: mockSet,
    del: mockDel,
    exists: mockExists,
  }),
}));

vi.mock("../../config/env.js", () => ({
  env: {
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    REDIS_URL: "redis://localhost:6379",
  },
}));

import { cacheDel, cacheExists, cacheGet, cacheSet } from "../cache.js";

describe("cacheGet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed JSON on cache hit", async () => {
    const data = { symbol: "ETH/BTC", price: 0.035 };
    mockGet.mockResolvedValue(JSON.stringify(data));

    const result = await cacheGet<typeof data>("market:crypto:ETH/BTC");

    expect(result).toEqual(data);
    expect(mockGet).toHaveBeenCalledWith("market:crypto:ETH/BTC");
  });

  it("returns null on cache miss", async () => {
    mockGet.mockResolvedValue(null);

    const result = await cacheGet("nonexistent");

    expect(result).toBeNull();
  });

  it("returns null on error (no throw)", async () => {
    mockGet.mockRejectedValue(new Error("Connection refused"));

    const result = await cacheGet("failing-key");

    expect(result).toBeNull();
  });
});

describe("cacheSet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls redis.set with correct args including TTL", async () => {
    mockSet.mockResolvedValue("OK");

    await cacheSet("my-key", { hello: "world" }, 600);

    expect(mockSet).toHaveBeenCalledWith("my-key", JSON.stringify({ hello: "world" }), "EX", 600);
  });

  it("uses default TTL of 3600 when not specified", async () => {
    mockSet.mockResolvedValue("OK");

    await cacheSet("my-key", "value");

    expect(mockSet).toHaveBeenCalledWith("my-key", JSON.stringify("value"), "EX", 3600);
  });

  it("does not throw on error", async () => {
    mockSet.mockRejectedValue(new Error("Connection refused"));

    await expect(cacheSet("key", "val")).resolves.toBeUndefined();
  });
});

describe("cacheDel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls redis.del", async () => {
    mockDel.mockResolvedValue(1);

    await cacheDel("key-to-delete");

    expect(mockDel).toHaveBeenCalledWith("key-to-delete");
  });

  it("does not throw on error", async () => {
    mockDel.mockRejectedValue(new Error("Connection refused"));

    await expect(cacheDel("key")).resolves.toBeUndefined();
  });
});

describe("cacheExists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when redis.exists returns 1", async () => {
    mockExists.mockResolvedValue(1);

    const result = await cacheExists("existing-key");

    expect(result).toBe(true);
  });

  it("returns false when redis.exists returns 0", async () => {
    mockExists.mockResolvedValue(0);

    const result = await cacheExists("nonexistent-key");

    expect(result).toBe(false);
  });

  it("returns false on error (no throw)", async () => {
    mockExists.mockRejectedValue(new Error("Connection refused"));

    const result = await cacheExists("failing-key");

    expect(result).toBe(false);
  });
});
