import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoClient, TABLE_NAME } from "./dynamo-client.js";

export interface StateItem {
  PK: string;
  SK: string;
  type: "STATE_ITEM";
  LastRun: string;
  Balance: number;
  UpdatedAt: string;
}

export async function getLatestState(): Promise<StateItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: "STATE", SK: "LATEST" },
    }),
  );

  return (result.Item as StateItem) ?? null;
}

export async function updateState(balance: number): Promise<StateItem> {
  const now = new Date().toISOString();

  const item: StateItem = {
    PK: "STATE",
    SK: "LATEST",
    type: "STATE_ITEM",
    LastRun: now,
    Balance: balance,
    UpdatedAt: now,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }),
  );

  return item;
}
