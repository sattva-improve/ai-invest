import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { logger } from "../lib/logger.js";
import { TABLE_NAME, dynamoClient } from "./dynamo-client.js";

const log = logger.child({ repository: "scalp-trade" });

export interface ScalpTradeItem {
  PK: "TRADE#SCALP";
  SK: string;
  type: "SCALP_TRADE_ITEM";
  Ticker: string;
  Side: "BUY" | "SELL";
  Price: number;
  StopLossPrice: number;
  TakeProfitPrice?: number;
  Profit: number;
  ProfitJPY?: number;
  Currency: string;
  ConversionRate?: number;
  OrderId: string;
  Status: "OPEN" | "CLOSED" | "STOPPED_OUT" | "PAPER";
  Confidence: number;
  EntryTimeframe: string;
  TrendAlignment: string;
  Signals: string;
  CreatedAt: string;
}

export interface StopLossItem {
  PK: "STOPLOSS#ACTIVE";
  SK: string;
  type: "STOPLOSS_ITEM";
  Ticker: string;
  EntryPrice: number;
  StopLossPrice: number;
  TakeProfitPrice?: number;
  Amount: number;
  OrderId: string;
  Side: "BUY";
  Currency: string;
  CreatedAt: string;
}

export interface SaveScalpTradeOptions {
  ticker: string;
  side: "BUY" | "SELL";
  price: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  profit?: number;
  profitJpy?: number;
  currency: string;
  conversionRate?: number;
  orderId: string;
  status: "OPEN" | "CLOSED" | "STOPPED_OUT" | "PAPER";
  confidence: number;
  entryTimeframe: string;
  trendAlignment: string;
  signals: string[];
}

export interface SaveStopLossOptions {
  ticker: string;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  amount: number;
  orderId: string;
  currency: string;
}

export async function saveScalpTrade(options: SaveScalpTradeOptions): Promise<ScalpTradeItem> {
  const now = new Date().toISOString();
  const sk = `${now}#${options.orderId}`;

  const item: ScalpTradeItem = {
    PK: "TRADE#SCALP",
    SK: sk,
    type: "SCALP_TRADE_ITEM",
    Ticker: options.ticker,
    Side: options.side,
    Price: options.price,
    StopLossPrice: options.stopLossPrice,
    TakeProfitPrice: options.takeProfitPrice,
    Profit: options.profit ?? 0,
    ProfitJPY: options.profitJpy,
    Currency: options.currency,
    ConversionRate: options.conversionRate,
    OrderId: options.orderId,
    Status: options.status,
    Confidence: options.confidence,
    EntryTimeframe: options.entryTimeframe,
    TrendAlignment: options.trendAlignment,
    Signals: options.signals.join(","),
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

export async function listRecentScalpTrades(limit = 20): Promise<ScalpTradeItem[]> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": "TRADE#SCALP",
      },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );

  return (result.Items ?? []) as ScalpTradeItem[];
}

export async function saveStopLoss(options: SaveStopLossOptions): Promise<StopLossItem> {
  const now = new Date().toISOString();

  const item: StopLossItem = {
    PK: "STOPLOSS#ACTIVE",
    SK: options.ticker,
    type: "STOPLOSS_ITEM",
    Ticker: options.ticker,
    EntryPrice: options.entryPrice,
    StopLossPrice: options.stopLossPrice,
    TakeProfitPrice: options.takeProfitPrice,
    Amount: options.amount,
    OrderId: options.orderId,
    Side: "BUY",
    Currency: options.currency,
    CreatedAt: now,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }),
  );

  log.info({ ticker: options.ticker, orderId: options.orderId }, "Stop-loss saved");
  return item;
}

export async function getAllActiveStopLosses(): Promise<StopLossItem[]> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": "STOPLOSS#ACTIVE",
      },
    }),
  );

  return (result.Items ?? []) as StopLossItem[];
}

export async function removeStopLoss(ticker: string): Promise<void> {
  await dynamoClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: "STOPLOSS#ACTIVE",
        SK: ticker,
      },
    }),
  );

  log.info({ ticker }, "Stop-loss removed");
}

export async function getScalpTradeStats(): Promise<{
  totalTrades: number;
  wins: number;
  losses: number;
  totalProfitJpy: number;
  winRate: number;
}> {
  const items: ScalpTradeItem[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: {
          ":pk": "TRADE#SCALP",
        },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    items.push(...((result.Items ?? []) as ScalpTradeItem[]));
    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  const totalTrades = items.length;
  const wins = items.filter((item) => item.Profit > 0).length;
  const losses = items.filter(
    (item) => item.Profit < 0 || (item.Status === "STOPPED_OUT" && item.Profit < 0),
  ).length;
  const totalProfitJpy = items.reduce((sum, item) => sum + (item.ProfitJPY ?? 0), 0);
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;

  return {
    totalTrades,
    wins,
    losses,
    totalProfitJpy,
    winRate,
  };
}
