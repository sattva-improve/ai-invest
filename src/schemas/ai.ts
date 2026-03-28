import { z } from "zod";

export const InvestmentDecisionSchema = z.object({
  ticker: z.string().describe("Trading symbol, e.g. ETH/BTC or AAPL"),
  action: z.enum(["BUY", "SELL", "HOLD"]).describe("Investment action"),
  positionSide: z
    .enum(["LONG", "SHORT"])
    .default("LONG")
    .describe("Position side: LONG (buy low sell high) or SHORT (sell high buy low)"),
  leverage: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(1)
    .describe("Leverage multiplier (1 = no leverage, max 20)"),
  confidence: z.number().min(0).max(1).describe("Confidence level from 0.0 to 1.0"),
  reasoning: z.string().describe("Explanation of the investment decision"),
  targetPrice: z.number().positive().optional().describe("Target price for the trade"),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM").describe("Risk assessment"),
  timeHorizon: z
    .enum(["SHORT", "MEDIUM", "LONG"])
    .default("SHORT")
    .describe("Expected time horizon for the trade"),
});

export type InvestmentDecision = z.infer<typeof InvestmentDecisionSchema>;
