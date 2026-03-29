import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { logger } from "../lib/logger.js";
import { TABLE_NAME, dynamoClient } from "./dynamo-client.js";

const log = logger.child({ repository: "position" });

export interface PositionItem {
  PK: string;
  SK: string;
  type: "POSITION_ITEM";
  Ticker: string;
  Amount: number;
  AvgBuyPrice: number;
  TotalInvested: number;
  Currency: string;
  TotalInvestedJPY: number;
  UpdatedAt: string;
}

export async function getPosition(ticker: string): Promise<PositionItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: "POSITION", SK: ticker },
    }),
  );
  return (result.Item as PositionItem) ?? null;
}

export async function getAllPositions(): Promise<PositionItem[]> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": "POSITION" },
    }),
  );
  return (result.Items ?? []) as PositionItem[];
}

export async function addToPosition(
  ticker: string,
  amount: number,
  price: number,
  currency: string,
  jpyEquivalent: number,
): Promise<PositionItem> {
  const existing = await getPosition(ticker);
  const now = new Date().toISOString();

  let newAmount: number;
  let newTotalInvested: number;
  let newTotalInvestedJPY: number;
  let newAvgBuyPrice: number;

  if (existing) {
    newAmount = existing.Amount + amount;
    newTotalInvested = existing.TotalInvested + amount * price;
    newTotalInvestedJPY = existing.TotalInvestedJPY + jpyEquivalent;
    newAvgBuyPrice = newAmount > 0 ? newTotalInvested / newAmount : 0;
  } else {
    newAmount = amount;
    newTotalInvested = amount * price;
    newTotalInvestedJPY = jpyEquivalent;
    newAvgBuyPrice = price;
  }

  const item: PositionItem = {
    PK: "POSITION",
    SK: ticker,
    type: "POSITION_ITEM",
    Ticker: ticker,
    Amount: newAmount,
    AvgBuyPrice: newAvgBuyPrice,
    TotalInvested: newTotalInvested,
    Currency: currency,
    TotalInvestedJPY: newTotalInvestedJPY,
    UpdatedAt: now,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }),
  );

  log.info({ ticker, amount: newAmount, avgPrice: newAvgBuyPrice }, "Position updated (BUY)");
  return item;
}

export async function reducePosition(ticker: string, amount: number): Promise<PositionItem | null> {
  const existing = await getPosition(ticker);
  if (!existing) {
    log.warn({ ticker }, "Cannot reduce position — no position exists");
    return null;
  }

  const newAmount = Math.max(0, existing.Amount - amount);
  const now = new Date().toISOString();

  const ratio = existing.Amount > 0 ? newAmount / existing.Amount : 0;
  const newTotalInvested = existing.TotalInvested * ratio;
  const newTotalInvestedJPY = existing.TotalInvestedJPY * ratio;

  const item: PositionItem = {
    PK: "POSITION",
    SK: ticker,
    type: "POSITION_ITEM",
    Ticker: ticker,
    Amount: newAmount,
    AvgBuyPrice: existing.AvgBuyPrice,
    TotalInvested: newTotalInvested,
    Currency: existing.Currency,
    TotalInvestedJPY: newTotalInvestedJPY,
    UpdatedAt: now,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }),
  );

  log.info({ ticker, amount: newAmount }, "Position updated (SELL)");
  return item;
}
