import type { ScheduledEvent, ScheduledHandler } from "aws-lambda";
import { RSS_FEEDS } from "../config/rss-feeds.js";
import { logger } from "../lib/logger.js";
import { type InvestmentDecision, InvestmentDecisionSchema } from "../schemas/ai.js";
import { type AppConfig, AppConfigSchema } from "../schemas/config.js";
import type { OrderRequest } from "../schemas/trade.js";
import { executeTrade } from "../services/trader.js";

export interface ExecuteTradeHandlerResult {
  executed: number;
  skipped: number;
  errors: number;
}

export async function executeTradeHandler(
  decision: InvestmentDecision,
  config: AppConfig,
  marketPrice?: number,
): Promise<ExecuteTradeHandlerResult> {
  const log = logger.child({ handler: "execute-trade" });

  if (decision.confidence <= config.confidenceThreshold) {
    log.info(
      {
        ticker: decision.ticker,
        confidence: decision.confidence,
        threshold: config.confidenceThreshold,
      },
      "Skipping trade — confidence below threshold",
    );
    return { executed: 0, skipped: 1, errors: 0 };
  }

  if (decision.action === "HOLD") {
    log.info({ ticker: decision.ticker }, "Skipping trade — action is HOLD");
    return { executed: 0, skipped: 1, errors: 0 };
  }

  try {
    const price = marketPrice ?? decision.targetPrice ?? 0;
    const amount = price > 0 ? config.maxOrderValueUsd / price : 0;

    if (amount <= 0) {
      log.warn(
        { ticker: decision.ticker, marketPrice, targetPrice: decision.targetPrice },
        "Cannot calculate order amount — no valid price",
      );
      return { executed: 0, skipped: 1, errors: 0 };
    }

    const orderRequest: OrderRequest = {
      symbol: decision.ticker,
      side: decision.action === "BUY" ? "buy" : "sell",
      amount,
      price: marketPrice ?? decision.targetPrice,
      type: "market",
    };

    const result = await executeTrade(orderRequest, config, decision);

    log.info(
      {
        orderId: result.orderId,
        symbol: result.symbol,
        side: result.side,
        executedPrice: result.executedPrice,
        isPaperTrade: result.isPaperTrade,
      },
      "Trade executed successfully",
    );

    return { executed: 1, skipped: 0, errors: 0 };
  } catch (error) {
    log.error({ error, ticker: decision.ticker }, "Failed to execute trade");
    return { executed: 0, skipped: 0, errors: 1 };
  }
}

// --- AWS Lambda entry point ---
const defaultConfig = AppConfigSchema.parse({
  rssFeeds: RSS_FEEDS,
  tradingPairs: [
    { symbol: "BTC/USDT", assetType: "crypto", enabled: true },
    { symbol: "ETH/USDT", assetType: "crypto", enabled: true },
  ],
});

export const handler: ScheduledHandler = async (event: ScheduledEvent) => {
  // In Step Functions, event detail contains the decision
  const decision = InvestmentDecisionSchema.parse(
    (event as unknown as Record<string, unknown>).detail ?? event,
  );
  await executeTradeHandler(decision, defaultConfig);
};
