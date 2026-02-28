import { z } from "zod";

export const InvestmentDecisionSchema = z.object({
  ticker: z.string().describe("Trading symbol, e.g. BTC/USDT or AAPL"),
  action: z.enum(["BUY", "SELL", "HOLD"]).describe("Investment action"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence level from 0.0 to 1.0"),
  reasoning: z.string().describe("Explanation of the investment decision"),
  targetPrice: z
    .number()
    .positive()
    .optional()
    .describe("Target price for the trade"),
  riskLevel: z
    .enum(["LOW", "MEDIUM", "HIGH"])
    .default("MEDIUM")
    .describe("Risk assessment"),
  timeHorizon: z
    .enum(["SHORT", "MEDIUM", "LONG"])
    .default("SHORT")
    .describe("Expected time horizon for the trade"),
});

export type InvestmentDecision = z.infer<typeof InvestmentDecisionSchema>;
