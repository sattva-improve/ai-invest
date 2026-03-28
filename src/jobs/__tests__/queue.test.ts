const mockQueueConstructor = vi.fn();
const mockUpsertJobScheduler = vi.fn();
const mockClose = vi.fn();
const mockGetRedisClient = vi.fn();
const mockGetRedisConnectionOptions = vi.fn();

vi.mock("bullmq", async () => {
  return {
    Queue: function Queue(this: unknown, name: string) {
      mockQueueConstructor(name);
      return {
        upsertJobScheduler: (...args: unknown[]) => mockUpsertJobScheduler(...args),
        close: (...args: unknown[]) => mockClose(...args),
      };
    },
  };
});

vi.mock("../../lib/redis-client.js", () => ({
  getRedisClient: (...args: unknown[]) => mockGetRedisClient(...args),
  getRedisConnectionOptions: (...args: unknown[]) => mockGetRedisConnectionOptions(...args),
}));

vi.mock("../../config/env.js", () => ({
  env: {
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    GITHUB_COPILOT_TOKEN: "test-token",
  },
}));

import type { AppConfig } from "../../schemas/config.js";
import { setupQueues, teardownQueues } from "../queue.js";

const testConfig: AppConfig = {
  rssFeeds: [{ name: "Test", url: "https://example.com/rss", enabled: true }],
  tradingPairs: [{ symbol: "ETH/BTC", exchange: "binance", assetType: "crypto", enabled: true }],
  confidenceThreshold: 0.8,
  fetchIntervalMinutes: 60,
  priceIntervalMinutes: 5,
  maxOrderValueBtc: 0.001,
};

describe("jobs/queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedisClient.mockReturnValue({});
    mockGetRedisConnectionOptions.mockReturnValue({
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: null,
    });
    mockUpsertJobScheduler.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
  });

  it("setupQueues creates queues and schedules repeatable jobs", async () => {
    const { newsQueue, priceQueue } = await setupQueues(testConfig);

    expect(mockQueueConstructor).toHaveBeenCalledWith("fetch-news");
    expect(mockQueueConstructor).toHaveBeenCalledWith("fetch-price");
    expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      "fetch-news-repeat",
      { every: 60 * 60 * 1000 },
      { data: {} },
    );
    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      "fetch-price-repeat",
      { every: 5 * 60 * 1000 },
      { data: {} },
    );

    await teardownQueues(
      newsQueue as unknown as import("bullmq").Queue,
      priceQueue as unknown as import("bullmq").Queue,
    );
    expect(mockClose).toHaveBeenCalledTimes(2);
  });
});
