import { z } from "zod";

export const OrderRequestSchema = z.object({
  symbol: z.string(),
  side: z.enum(["buy", "sell"]),
  amount: z.number().positive(),
  price: z.number().positive().optional(), // limit order price
  type: z.enum(["market", "limit"]).default("market"),
});

export const OrderResultSchema = z.object({
  orderId: z.string(),
  symbol: z.string(),
  side: z.enum(["buy", "sell"]),
  amount: z.number().positive(),
  executedPrice: z.number().positive(),
  status: z.enum(["open", "closed", "canceled"]),
  timestamp: z.string(), // ISO 8601
  isPaperTrade: z.boolean(),
});

export type OrderRequest = z.infer<typeof OrderRequestSchema>;
export type OrderResult = z.infer<typeof OrderResultSchema>;
