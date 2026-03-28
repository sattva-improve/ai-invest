import { z } from "zod";

export const OrderRequestSchema = z.object({
  symbol: z.string(),
  side: z.enum(["buy", "sell"]),
  positionSide: z.enum(["long", "short"]).default("long"),
  amount: z.number().positive(),
  price: z.number().positive().optional(), // limit order price
  type: z.enum(["market", "limit"]).default("market"),
  leverage: z.number().int().min(1).max(20).default(1),
  marginMode: z.enum(["cross", "isolated"]).default("isolated"),
});

export const OrderResultSchema = z.object({
  orderId: z.string(),
  symbol: z.string(),
  side: z.enum(["buy", "sell"]),
  positionSide: z.enum(["long", "short"]).default("long"),
  amount: z.number().positive(),
  executedPrice: z.number().positive(),
  leverage: z.number().int().min(1).max(20).default(1),
  status: z.enum(["open", "closed", "canceled"]),
  timestamp: z.string(), // ISO 8601
  isPaperTrade: z.boolean(),
});

export type OrderRequest = z.infer<typeof OrderRequestSchema>;
export type OrderResult = z.infer<typeof OrderResultSchema>;
