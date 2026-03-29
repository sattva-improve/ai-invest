import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { logger } from "../lib/logger.js";
import type { InvestmentDecision } from "../schemas/ai.js";
import { TABLE_NAME, dynamoClient } from "./dynamo-client.js";

const log = logger.child({ repository: "trade" });

export interface TradeItem {
  PK: string;
  SK: string;
  type: "TRADE_ITEM";
  Ticker: string;
  Side: "BUY" | "SELL";
  PositionSide: "LONG" | "SHORT";
  Price: number;
  Leverage: number;
  Profit: number;
  Currency?: string;
  ProfitJPY?: number;
  ConversionRate?: number;
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
  currency?: string;
  profitJpy?: number;
  conversionRate?: number;
  isPaper?: boolean;
}

export async function saveTradeItem(options: SaveTradeOptions): Promise<TradeItem> {
  const {
    decision,
    executedPrice,
    orderId,
    profit = 0,
    currency,
    profitJpy,
    conversionRate,
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
    PositionSide: decision.positionSide ?? "LONG",
    Price: executedPrice,
    Leverage: decision.leverage ?? 1,
    Profit: profit,
    Currency: currency,
    ProfitJPY: profitJpy,
    ConversionRate: conversionRate,
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

export async function getLastTradeByTickerAndSide(
  ticker: string,
  side: "BUY" | "SELL",
): Promise<TradeItem | null> {
  const pageLimit = 50;
  const maxPages = 5;
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  for (let page = 1; page <= maxPages; page++) {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        FilterExpression: "Ticker = :ticker AND Side = :side",
        ExpressionAttributeValues: {
          ":pk": "TRADE",
          ":ticker": ticker,
          ":side": side,
        },
        ScanIndexForward: false,
        Limit: pageLimit,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    const items = (result.Items ?? []) as TradeItem[];
    if (items.length > 0) {
      return items[0];
    }

    if (!result.LastEvaluatedKey) {
      return null;
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  }

  log.warn(
    { ticker, side, maxPages, pageLimit },
    "Reached max pages while searching last trade by ticker and side",
  );
  return null;
}
