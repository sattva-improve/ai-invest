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
    GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
  },
}));

import { getLatestState, updateState } from "../state-repository.js";

describe("state-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getLatestState returns null when no item", async () => {
    mockSend.mockResolvedValue({ Item: undefined });
    const result = await getLatestState();
    expect(result).toBeNull();
  });

  it("getLatestState returns the item when present", async () => {
    const item = {
      PK: "STATE",
      SK: "LATEST",
      type: "STATE_ITEM",
      LastRun: "2026-01-01T00:00:00.000Z",
      Balance: 123,
      UpdatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockSend.mockResolvedValue({ Item: item });

    const result = await getLatestState();
    expect(result).toEqual(item);
  });

  it("updateState writes STATE/LATEST and returns item", async () => {
    mockSend.mockResolvedValue({});

    const result = await updateState(42);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input.TableName).toBe("InvestmentTable");
    expect(command.input.Item.PK).toBe("STATE");
    expect(command.input.Item.SK).toBe("LATEST");
    expect(command.input.Item.Balance).toBe(42);
    expect(result.PK).toBe("STATE");
    expect(result.Balance).toBe(42);
  });
});
