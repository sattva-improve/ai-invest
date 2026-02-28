import { z } from "zod";

export const RssFeedSchema = z.object({
  name: z.string().describe("Feed display name"),
  url: z.string().url().describe("RSS feed URL"),
  enabled: z.boolean().default(true),
});

export const TradingPairSchema = z.object({
  symbol: z.string().describe("Trading pair symbol, e.g. BTC/USDT"),
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
  maxOrderValueUsd: z.number().positive().default(100),
});

export type RssFeed = z.infer<typeof RssFeedSchema>;
export type TradingPair = z.infer<typeof TradingPairSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
