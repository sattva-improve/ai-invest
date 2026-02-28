const mockSetupQueues = vi.fn();
const mockTeardownQueues = vi.fn();
const mockCreateFetchNewsWorker = vi.fn();
const mockCreateFetchPriceWorker = vi.fn();
const mockCloseRedis = vi.fn();

vi.mock("../../jobs/queue.js", () => ({
  setupQueues: (...args: unknown[]) => mockSetupQueues(...args),
  teardownQueues: (...args: unknown[]) => mockTeardownQueues(...args),
}));

vi.mock("../../jobs/fetch-news-job.js", () => ({
  createFetchNewsWorker: (...args: unknown[]) => mockCreateFetchNewsWorker(...args),
}));

vi.mock("../../jobs/fetch-price-job.js", () => ({
  createFetchPriceWorker: (...args: unknown[]) => mockCreateFetchPriceWorker(...args),
}));

vi.mock("../../lib/redis-client.js", () => ({
  closeRedis: (...args: unknown[]) => mockCloseRedis(...args),
}));

vi.mock("../../config/env.js", () => ({
  env: {
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
  },
}));

import { main } from "../main.js";

describe("main", () => {
  it("starts workers and sets up queues", async () => {
    const newsWorker = { close: vi.fn().mockResolvedValue(undefined) };
    const priceWorker = { close: vi.fn().mockResolvedValue(undefined) };
    const newsQueue = { close: vi.fn().mockResolvedValue(undefined) };
    const priceQueue = { close: vi.fn().mockResolvedValue(undefined) };

    mockCreateFetchNewsWorker.mockReturnValue(newsWorker);
    mockCreateFetchPriceWorker.mockReturnValue(priceWorker);
    mockSetupQueues.mockResolvedValue({ newsQueue, priceQueue });
    mockTeardownQueues.mockResolvedValue(undefined);
    mockCloseRedis.mockResolvedValue(undefined);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as unknown as typeof process.exit);

    const onSpy = vi.spyOn(process, "on");

    await main();

    expect(mockCreateFetchNewsWorker).toHaveBeenCalledTimes(1);
    expect(mockCreateFetchPriceWorker).toHaveBeenCalledTimes(1);
    expect(mockSetupQueues).toHaveBeenCalledTimes(1);

    expect(onSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));

    exitSpy.mockRestore();
    onSpy.mockRestore();
  });
});
