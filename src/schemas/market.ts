import { z } from "zod";

export const MarketDataSchema = z.object({
  symbol: z.string().describe("Trading symbol, e.g. ETH/BTC"),
  price: z.number().positive().describe("Current price"),
  rsi: z.number().min(0).max(100).optional().describe("Relative Strength Index (14-period)"),
  sma20: z.number().positive().optional().describe("Simple Moving Average (20-period)"),
  sma50: z.number().positive().optional().describe("Simple Moving Average (50-period)"),
  macd: z.number().optional().describe("MACD line value"),
  macdSignal: z.number().optional().describe("MACD signal line value"),
  macdHistogram: z.number().optional().describe("MACD histogram value"),
  bollingerUpper: z.number().positive().optional().describe("Bollinger Band upper"),
  bollingerLower: z.number().positive().optional().describe("Bollinger Band lower"),
  volume: z.number().nonnegative().describe("24h trading volume"),
  timestamp: z.string().describe("ISO 8601 timestamp"),
  exchange: z.string().optional().describe("Exchange name"),
  assetType: z.enum(["crypto", "stock", "etf"]).describe("Asset classification"),
});

export type MarketData = z.infer<typeof MarketDataSchema>;
