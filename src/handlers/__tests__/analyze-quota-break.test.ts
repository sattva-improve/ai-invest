const mockFetchRssFeeds = vi.fn();
const mockFindByUrl = vi.fn();
const mockSaveNewsItem = vi.fn();
const mockAnalyzeNews = vi.fn();

vi.mock("../../providers/rss.js", () => ({
  fetchRssFeeds: (...args: unknown[]) => mockFetchRssFeeds(...args),
}));

vi.mock("../../repositories/news-repository.js", () => ({
  findByUrl: (...args: unknown[]) => mockFindByUrl(...args),
  saveNewsItem: (...args: unknown[]) => mockSaveNewsItem(...args),
}));

vi.mock("../../services/ai-analyzer.js", () => ({
  analyzeNews: (...args: unknown[]) => mockAnalyzeNews(...args),
}));

vi.mock("../../providers/crypto-market.js", () => ({
  getCryptoMarketData: vi.fn(),
}));

const sampleConfig = {
  rssFeeds: [{ name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", enabled: true }],
  tradingPairs: [{ symbol: "ETH/BTC", assetType: "crypto", enabled: true }],
  confidenceThreshold: 0.8,
  fetchIntervalMinutes: 60,
  priceIntervalMinutes: 5,
  maxOrderValueBtc: 0.001,
  maxLeverage: 5,
  marginMode: "isolated",
  enableShortSelling: true,
} as const;

const sampleArticles = [
  {
    id: "a-1",
    title: "t1",
    url: "https://example.com/1",
    source: "s",
    publishedAt: new Date().toISOString(),
    summary: "x",
  },
  {
    id: "a-2",
    title: "t2",
    url: "https://example.com/2",
    source: "s",
    publishedAt: new Date().toISOString(),
    summary: "y",
  },
];

import { analyzeHandler } from "../analyze.js";

describe("analyzeHandler quota/retry exhaustion break", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchRssFeeds.mockResolvedValue(sampleArticles);
    mockFindByUrl.mockResolvedValue(null);
    mockSaveNewsItem.mockResolvedValue(undefined);
  });

  it("stops processing when AI_RetryError is thrown", async () => {
    const retryError = { name: "AI_RetryError", reason: "maxRetriesExceeded" };
    mockAnalyzeNews.mockRejectedValue(retryError);

    const result = await analyzeHandler(sampleConfig);

    expect(mockAnalyzeNews).toHaveBeenCalledTimes(1);
    expect(result.action).toBe("HOLD");
    expect(result.confidence).toBe(0);
  });
});
