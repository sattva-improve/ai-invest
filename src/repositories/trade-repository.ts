import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { InvestmentDecision } from "../schemas/ai.js";
import { dynamoClient, TABLE_NAME } from "./dynamo-client.js";

export interface TradeItem {
  PK: string;
  SK: string;
  type: "TRADE_ITEM";
  Ticker: string;
  Side: "BUY" | "SELL";
  Price: number;
  Profit: number;
  OrderId: string;
  Status: "OPEN" | "CLOSED" | "PAPER";
  Confidence: number;
  CreatedAt: string;
}

export interface SaveTradeOptions {
  decision: InvestmentDecision;
  executedPrice: number;
  orderId: string;
  profit?: number;
  isPaper?: boolean;
}

export async function saveTradeItem(
  options: SaveTradeOptions,
): Promise<TradeItem> {
  const {
    decision,
    executedPrice,
    orderId,
    profit = 0,
    isPaper = false,
  } = options;
  const now = new Date().toISOString();
  const sk = `${now}#${orderId}`;

  const item: TradeItem = {
    PK: "TRADE",
    SK: sk,
    type: "TRADE_ITEM",
    Ticker: decision.ticker,
    Side: decision.action as "BUY" | "SELL",
    Price: executedPrice,
    Profit: profit,
    OrderId: orderId,
    Status: isPaper ? "PAPER" : "OPEN",
    Confidence: decision.confidence,
    CreatedAt: now,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }),
  );

  return item;
}

export async function listRecentTrades(limit = 20): Promise<TradeItem[]> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": "TRADE",
      },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );

  return (result.Items ?? []) as TradeItem[];
}
