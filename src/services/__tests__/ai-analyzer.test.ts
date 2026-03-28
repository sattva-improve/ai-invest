const { mockGithub } = vi.hoisted(() => ({
  mockGithub: vi.fn(() => "mock-model"),
}));

const mockGenerateObject = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../config/env.js", () => ({
  env: {
    GITHUB_TOKEN: "ghp_test_token",
    GITHUB_MODEL_ID: "openai/gpt-4.1",
    CONFIDENCE_THRESHOLD: 0.8,
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
  },
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() => mockGithub),
}));

import type { MarketData } from "../../schemas/market.js";
import type { NewsArticle } from "../../schemas/news.js";
import { analyzeNews } from "../ai-analyzer.js";

const testArticle: NewsArticle = {
  id: "test-id-1",
  title: "Bitcoin Surges Past $100K",
  url: "https://example.com/btc-surges",
  publishedAt: "2026-01-15T10:30:00.000Z",
  source: "CryptoNews",
  summary: "Bitcoin hits new all-time high",
};

const testMarketData: MarketData = {
  symbol: "ETH/BTC",
  price: 0.035,
  rsi: 72,
  volume: 5000000,
  timestamp: "2026-01-15T10:30:00.000Z",
  exchange: "binance",
  assetType: "crypto",
};

const decision = {
  ticker: "ETH/BTC",
  action: "BUY" as const,
  confidence: 0.6,
  reasoning: "Analysis: bullish",
  riskLevel: "MEDIUM" as const,
  timeHorizon: "SHORT" as const,
};

describe("analyzeNews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns InvestmentDecision from model", async () => {
    mockGenerateObject.mockResolvedValue({ object: decision });

    const result = await analyzeNews({ article: testArticle });

    expect(result).toEqual(decision);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("passes marketData to prompt when provided", async () => {
    mockGenerateObject.mockResolvedValue({ object: decision });

    const result = await analyzeNews({
      article: testArticle,
      marketData: testMarketData,
    });

    expect(result).toEqual(decision);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.prompt).toContain("ETH/BTC");
    expect(callArgs.prompt).toContain("0.035");
  });

  it("works without marketData", async () => {
    mockGenerateObject.mockResolvedValue({ object: decision });

    const result = await analyzeNews({
      article: testArticle,
      marketData: undefined,
    });

    expect(result).toEqual(decision);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });
});
