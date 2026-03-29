import { beforeEach, describe, expect, it, vi } from "vitest";

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

import type { InvestmentDecision } from "../../schemas/ai.js";
import {
  getLastTradeByTickerAndSide,
  listRecentTrades,
  saveTradeItem,
} from "../trade-repository.js";

const testDecision: InvestmentDecision = {
  ticker: "ETH/BTC",
  action: "BUY",
  positionSide: "LONG",
  leverage: 1,
  confidence: 0.9,
  reasoning: "Strong bullish momentum",
  riskLevel: "MEDIUM",
  timeHorizon: "SHORT",
};

describe("saveTradeItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls PutCommand with PK='TRADE'", async () => {
    mockSend.mockResolvedValue({});

    await saveTradeItem({
      decision: testDecision,
      executedPrice: 50000,
      orderId: "order-123",
      isPaper: true,
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input.TableName).toBe("InvestmentTable");
    expect(command.input.Item.PK).toBe("TRADE");
    expect(command.input.Item.type).toBe("TRADE_ITEM");
    expect(command.input.Item.Ticker).toBe("ETH/BTC");
    expect(command.input.Item.Price).toBe(50000);
    expect(command.input.Item.OrderId).toBe("order-123");
  });

  it("sets Status='PAPER' when isPaper=true", async () => {
    mockSend.mockResolvedValue({});

    const result = await saveTradeItem({
      decision: testDecision,
      executedPrice: 50000,
      orderId: "paper-123",
      isPaper: true,
    });

    expect(result.Status).toBe("PAPER");
  });

  it("sets Status='OPEN' when isPaper=false", async () => {
    mockSend.mockResolvedValue({});

    const result = await saveTradeItem({
      decision: testDecision,
      executedPrice: 50000,
      orderId: "real-123",
      isPaper: false,
    });

    expect(result.Status).toBe("OPEN");
  });

  it("returns the created TradeItem with correct fields", async () => {
    mockSend.mockResolvedValue({});

    const result = await saveTradeItem({
      decision: testDecision,
      executedPrice: 50000,
      orderId: "order-123",
    });

    expect(result.PK).toBe("TRADE");
    expect(result.Ticker).toBe("ETH/BTC");
    expect(result.Side).toBe("BUY");
    expect(result.Confidence).toBe(0.9);
    expect(result.SK).toBeDefined();
    expect(result.CreatedAt).toBeDefined();
  });
});

describe("listRecentTrades", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries with PK='TRADE'", async () => {
    mockSend.mockResolvedValue({ Items: [] });

    await listRecentTrades(10);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input.KeyConditionExpression).toBe("PK = :pk");
    expect(command.input.ExpressionAttributeValues[":pk"]).toBe("TRADE");
    expect(command.input.ScanIndexForward).toBe(false);
    expect(command.input.Limit).toBe(10);
  });

  it("returns empty array when no items", async () => {
    mockSend.mockResolvedValue({ Items: undefined });

    const result = await listRecentTrades();

    expect(result).toEqual([]);
  });
});

describe("getLastTradeByTickerAndSide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("paginates until match is found", async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: { PK: "TRADE", SK: "2026-01-01T00:00:00.000Z#order-1" },
      })
      .mockResolvedValueOnce({
        Items: [
          {
            PK: "TRADE",
            SK: "2026-01-01T00:01:00.000Z#order-2",
            type: "TRADE_ITEM",
            Ticker: "ETH/BTC",
            Side: "BUY",
            PositionSide: "LONG",
            Price: 0.03,
            Leverage: 1,
            Profit: 0,
            OrderId: "order-2",
            Status: "PAPER",
            Confidence: 0.9,
            CreatedAt: "2026-01-01T00:01:00.000Z",
          },
        ],
      });

    const result = await getLastTradeByTickerAndSide("ETH/BTC", "BUY");

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[0][0].input.ExclusiveStartKey).toBeUndefined();
    expect(mockSend.mock.calls[1][0].input.ExclusiveStartKey).toEqual({
      PK: "TRADE",
      SK: "2026-01-01T00:00:00.000Z#order-1",
    });
    expect(result?.OrderId).toBe("order-2");
  });

  it("returns null when no match found across all pages", async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: { PK: "TRADE", SK: "2026-01-01T00:00:00.000Z#order-1" },
      })
      .mockResolvedValueOnce({
        Items: [],
      });

    const result = await getLastTradeByTickerAndSide("ETH/BTC", "SELL");

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(result).toBeNull();
  });
});
