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

vi.mock("../../lib/logger.js", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

import {
  addToPosition,
  getAllPositions,
  getPosition,
  reducePosition,
} from "../position-repository.js";

describe("position-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getPosition returns item from DynamoDB Get", async () => {
    const item = {
      PK: "POSITION",
      SK: "BTC/JPY",
      type: "POSITION_ITEM",
      Ticker: "BTC/JPY",
      Amount: 0.5,
      AvgBuyPrice: 10000000,
      TotalInvested: 5000000,
      Currency: "JPY",
      TotalInvestedJPY: 5000000,
      UpdatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockSend.mockResolvedValue({ Item: item });

    const result = await getPosition("BTC/JPY");

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input.TableName).toBe("InvestmentTable");
    expect(command.input.Key).toEqual({ PK: "POSITION", SK: "BTC/JPY" });
    expect(result).toEqual(item);
  });

  it("getPosition returns null when no item", async () => {
    mockSend.mockResolvedValue({ Item: undefined });

    const result = await getPosition("ETH/BTC");

    expect(result).toBeNull();
  });

  it("getAllPositions returns array of items", async () => {
    const items = [
      {
        PK: "POSITION",
        SK: "BTC/JPY",
        type: "POSITION_ITEM",
        Ticker: "BTC/JPY",
        Amount: 0.1,
        AvgBuyPrice: 9000000,
        TotalInvested: 900000,
        Currency: "JPY",
        TotalInvestedJPY: 900000,
        UpdatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        PK: "POSITION",
        SK: "ETH/BTC",
        type: "POSITION_ITEM",
        Ticker: "ETH/BTC",
        Amount: 0.3,
        AvgBuyPrice: 0.038,
        TotalInvested: 0.0114,
        Currency: "BTC",
        TotalInvestedJPY: 160000,
        UpdatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    mockSend.mockResolvedValue({ Items: items });

    const result = await getAllPositions();

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input.KeyConditionExpression).toBe("PK = :pk");
    expect(command.input.ExpressionAttributeValues[":pk"]).toBe("POSITION");
    expect(result).toEqual(items);
  });

  it("getAllPositions returns empty array when no positions", async () => {
    mockSend.mockResolvedValue({ Items: undefined });

    const result = await getAllPositions();

    expect(result).toEqual([]);
  });

  it("addToPosition creates new position when none exists", async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined }).mockResolvedValueOnce({});

    const result = await addToPosition("BTC/JPY", 0.5, 10000000, "JPY", 5000000);

    expect(mockSend).toHaveBeenCalledTimes(2);
    const putCommand = mockSend.mock.calls[1][0];
    expect(putCommand.input.TableName).toBe("InvestmentTable");
    expect(putCommand.input.Item.PK).toBe("POSITION");
    expect(putCommand.input.Item.SK).toBe("BTC/JPY");
    expect(putCommand.input.Item.Amount).toBe(0.5);
    expect(putCommand.input.Item.AvgBuyPrice).toBe(10000000);
    expect(putCommand.input.Item.TotalInvested).toBe(5000000);

    expect(result.PK).toBe("POSITION");
    expect(result.SK).toBe("BTC/JPY");
    expect(result.Amount).toBe(0.5);
    expect(result.AvgBuyPrice).toBe(10000000);
    expect(result.TotalInvested).toBe(5000000);
    expect(result.Currency).toBe("JPY");
  });

  it("addToPosition adds to existing position with recalculated average", async () => {
    const existing = {
      PK: "POSITION",
      SK: "ETH/BTC",
      type: "POSITION_ITEM" as const,
      Ticker: "ETH/BTC",
      Amount: 0.1,
      AvgBuyPrice: 0.035,
      TotalInvested: 0.0035,
      Currency: "BTC",
      TotalInvestedJPY: 50000,
      UpdatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockSend.mockResolvedValueOnce({ Item: existing }).mockResolvedValueOnce({});

    const result = await addToPosition("ETH/BTC", 0.2, 0.04, "BTC", 120000);

    expect(result.Amount).toBeCloseTo(0.3);
    expect(result.TotalInvested).toBeCloseTo(0.0115);
    expect(result.AvgBuyPrice).toBeCloseTo(0.0115 / 0.3, 8);
    expect(result.TotalInvestedJPY).toBe(170000);

    const putCommand = mockSend.mock.calls[1][0];
    expect(putCommand.input.Item.Amount).toBeCloseTo(0.3);
    expect(putCommand.input.Item.TotalInvested).toBeCloseTo(0.0115);
    expect(putCommand.input.Item.AvgBuyPrice).toBeCloseTo(0.0115 / 0.3, 8);
  });

  it("reducePosition reduces amount proportionally", async () => {
    const existing = {
      PK: "POSITION",
      SK: "BTC/JPY",
      type: "POSITION_ITEM" as const,
      Ticker: "BTC/JPY",
      Amount: 1,
      AvgBuyPrice: 10000000,
      TotalInvested: 10000000,
      Currency: "JPY",
      TotalInvestedJPY: 10000000,
      UpdatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockSend.mockResolvedValueOnce({ Item: existing }).mockResolvedValueOnce({});

    const result = await reducePosition("BTC/JPY", 0.25);

    expect(result).not.toBeNull();
    expect(result?.Amount).toBeCloseTo(0.75);
    expect(result?.TotalInvested).toBeCloseTo(7500000);
    expect(result?.TotalInvestedJPY).toBeCloseTo(7500000);
    expect(result?.AvgBuyPrice).toBe(10000000);

    const putCommand = mockSend.mock.calls[1][0];
    expect(putCommand.input.Item.Amount).toBeCloseTo(0.75);
    expect(putCommand.input.Item.TotalInvested).toBeCloseTo(7500000);
  });

  it("reducePosition returns null when no position exists", async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const result = await reducePosition("SOL/USDT", 1);

    expect(result).toBeNull();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
