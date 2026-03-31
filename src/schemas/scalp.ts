import { z } from "zod";

export const SCALP_TIMEFRAMES = ["1m", "5m", "15m", "1h", "1d"] as const;
export type ScalpTimeframe = (typeof SCALP_TIMEFRAMES)[number];

export const ScalpDecisionSchema = z.object({
  ticker: z.string().describe("Trading pair symbol, e.g. ETH/BTC or BTC/JPY"),
  action: z.enum(["BUY", "SELL", "HOLD"]).describe("Scalping action"),
  confidence: z.number().min(0).max(1).describe("Confidence level from 0.0 to 1.0"),
  reasoning: z.string().describe("Technical analysis explanation of the decision"),
  stopLossPrice: z
    .number()
    .positive()
    .describe("Stop-loss price level (ATR-based or AI-determined)"),
  takeProfitPrice: z.number().positive().optional().describe("Optional take-profit target price"),
  targetPrice: z.number().positive().optional().describe("Target price for the trade"),
  riskLevel: z
    .enum(["LOW", "MEDIUM", "HIGH"])
    .default("MEDIUM")
    .describe("Risk assessment based on volatility and signal strength"),
  entryTimeframe: z
    .enum(SCALP_TIMEFRAMES)
    .describe("Primary timeframe that generated the entry signal"),
  trendAlignment: z
    .enum(["ALIGNED", "CONFLICTING", "NEUTRAL"])
    .describe(
      "Multi-timeframe trend consensus: ALIGNED=all agree, CONFLICTING=disagree, NEUTRAL=mixed",
    ),
});

export type ScalpDecision = z.infer<typeof ScalpDecisionSchema>;

export const TimeframeIndicatorsSchema = z.object({
  timeframe: z.enum(SCALP_TIMEFRAMES),
  latestClose: z.number(),
  latestVolume: z.number(),
  rsi: z.number().optional(),
  sma20: z.number().optional(),
  sma50: z.number().optional(),
  macd: z.number().optional(),
  macdSignal: z.number().optional(),
  macdHistogram: z.number().optional(),
  bollingerUpper: z.number().optional(),
  bollingerLower: z.number().optional(),
  atr14: z.number().optional(),
});

export type TimeframeIndicators = z.infer<typeof TimeframeIndicatorsSchema>;
