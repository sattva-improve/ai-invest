import { z } from "zod";

export const RssFeedSchema = z.object({
  name: z.string().describe("Feed display name"),
  url: z.string().url().describe("RSS feed URL"),
  enabled: z.boolean().default(true),
});

export const TradingPairSchema = z.object({
  symbol: z.string().describe("Trading pair symbol, e.g. ETH/BTC"),
  exchange: z.string().default("binance").describe("Exchange ID"),
  assetType: z.enum(["crypto", "stock", "etf"]).describe("Asset type"),
  enabled: z.boolean().default(true),
});

export const AppConfigSchema = z.object({
  rssFeeds: z.array(RssFeedSchema).min(1),
  tradingPairs: z.array(TradingPairSchema).min(1),
  confidenceThreshold: z.number().min(0).max(1).default(0.8),
  fetchIntervalMinutes: z.number().positive().default(60),
  priceIntervalMinutes: z.number().positive().default(5),
  maxOrderValueBtc: z.number().positive().default(0.001),
  maxOrderValueJpy: z.number().positive().default(200),
  maxAllocationPercent: z.number().min(0.01).max(1).default(0.05),
  maxLeverage: z.number().int().min(1).max(20).default(1),
  marginMode: z.enum(["cross", "isolated"]).default("isolated"),
  enableShortSelling: z.boolean().default(false),
  scalpEnabled: z.boolean().default(false),
  scalpIntervalMinutes: z.number().positive().default(5),
  scalpConfidenceThreshold: z.number().min(0).max(1).default(0.75),
  scalpModelId: z.string().default("openai/gpt-4.1-mini"),
  scalpMaxPairsPerCycle: z.number().int().min(1).max(12).default(4),
  scalpStoplossMonitorSeconds: z.number().int().min(10).max(300).default(30),
  scalpAtrMultiplier: z.number().min(0.5).max(5).default(2.0),
});

export type RssFeed = z.infer<typeof RssFeedSchema>;
export type TradingPair = z.infer<typeof TradingPairSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
