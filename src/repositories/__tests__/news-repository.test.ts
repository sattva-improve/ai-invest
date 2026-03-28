const mockSend = vi.fn();

vi.mock("../../repositories/dynamo-client.js", () => ({
  dynamoClient: { send: (...args: unknown[]) => mockSend(...args) },
  TABLE_NAME: "InvestmentTable",
}));

vi.mock("../../config/env.js", () => ({
  env: {
    DYNAMODB_TABLE_NAME: "InvestmentTable",
    DYNAMODB_REGION: "ap-northeast-1",
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    GITHUB_COPILOT_TOKEN: "test-token",
  },
}));

import { saveNewsItem, findByUrl, listRecentNews } from "../news-repository.js";
import type { NewsArticle } from "../../schemas/news.js";

const testArticle: NewsArticle = {
  id: "test-uuid-123",
  title: "Bitcoin Hits $100K",
  url: "https://example.com/btc-100k",
  publishedAt: "2026-01-15T10:30:00.000Z",
  source: "CryptoNews",
};

describe("saveNewsItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls PutCommand with correct PK='NEWS'", async () => {
    mockSend.mockResolvedValue({});

    const result = await saveNewsItem(testArticle, 0.85);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input.TableName).toBe("InvestmentTable");
    expect(command.input.Item.PK).toBe("NEWS");
    expect(command.input.Item.Title).toBe("Bitcoin Hits $100K");
    expect(command.input.Item.Url).toBe("https://example.com/btc-100k");
    expect(command.input.Item.Sentiment).toBe(0.85);
    expect(command.input.Item.type).toBe("NEWS_ITEM");
  });

  it("returns the created NewsItem", async () => {
    mockSend.mockResolvedValue({});

    const result = await saveNewsItem(testArticle, 0.5);

    expect(result.PK).toBe("NEWS");
    expect(result.Title).toBe("Bitcoin Hits $100K");
    expect(result.Sentiment).toBe(0.5);
    expect(result.SK).toBeDefined();
  });
});

describe("listRecentNews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls QueryCommand with PK='NEWS' and ScanIndexForward=false", async () => {
    mockSend.mockResolvedValue({ Items: [] });

    await listRecentNews(10);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input.KeyConditionExpression).toBe("PK = :pk");
    expect(command.input.ExpressionAttributeValues[":pk"]).toBe("NEWS");
    expect(command.input.ScanIndexForward).toBe(false);
    expect(command.input.Limit).toBe(10);
  });

  it("returns empty array when no items", async () => {
    mockSend.mockResolvedValue({ Items: undefined });

    const result = await listRecentNews();

    expect(result).toEqual([]);
  });
});

describe("findByUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matching item from recent news list", async () => {
    const matchingItem = {
      PK: "NEWS",
      SK: "2026-01-15T10:30:00.000Z#uuid-1",
      type: "NEWS_ITEM",
      Title: "Bitcoin Hits $100K",
      Url: "https://example.com/btc-100k",
      Source: "CryptoNews",
      Sentiment: 0.85,
      PublishedAt: "2026-01-15T10:30:00.000Z",
      CreatedAt: "2026-01-15T10:30:00.000Z",
      articleId: "uuid-1",
    };
    mockSend.mockResolvedValue({
      Items: [matchingItem],
    });

    const result = await findByUrl("https://example.com/btc-100k");

    expect(result).toEqual(matchingItem);
  });

  it("returns null when URL not found", async () => {
    mockSend.mockResolvedValue({
      Items: [
        {
          PK: "NEWS",
          SK: "2026-01-15T10:30:00.000Z#uuid-1",
          Url: "https://example.com/other",
        },
      ],
    });

    const result = await findByUrl("https://example.com/nonexistent");

    expect(result).toBeNull();
  });
});
