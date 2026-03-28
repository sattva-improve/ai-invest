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
import { listRecentTrades, saveTradeItem } from "../trade-repository.js";

const testDecision: InvestmentDecision = {
  ticker: "ETH/BTC",
  action: "BUY",
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

    const result = await saveTradeItem({
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
