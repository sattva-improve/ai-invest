import { z } from "zod";

export const MarketDataSchema = z.object({
  symbol: z.string().describe("Trading symbol, e.g. BTC/USDT"),
  price: z.number().positive().describe("Current price"),
  rsi: z.number().min(0).max(100).optional().describe("Relative Strength Index (14-period)"),
  volume: z.number().nonnegative().describe("24h trading volume"),
  timestamp: z.string().describe("ISO 8601 timestamp"),
  exchange: z.string().optional().describe("Exchange name"),
  assetType: z.enum(["crypto", "stock", "etf"]).describe("Asset classification"),
});

export type MarketData = z.infer<typeof MarketDataSchema>;
