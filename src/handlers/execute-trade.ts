import type { ScheduledEvent, ScheduledHandler } from "aws-lambda";
import type pino from "pino";
import { env } from "../config/env.js";
import { RSS_FEEDS } from "../config/rss-feeds.js";
import { TRADING_PAIRS } from "../config/trading-pairs.js";
import { convertToJpy, getBtcJpyRate, getQuoteCurrency } from "../lib/currency-converter.js";
import { logger } from "../lib/logger.js";
import { getAllPositions } from "../repositories/position-repository.js";
import { getLastTradeByTickerAndSide } from "../repositories/trade-repository.js";
import { type InvestmentDecision, InvestmentDecisionSchema } from "../schemas/ai.js";
import { type AppConfig, AppConfigSchema } from "../schemas/config.js";
import type { OrderRequest } from "../schemas/trade.js";
import { executeTrade } from "../services/trader.js";

export interface ExecuteTradeHandlerResult {
  executed: number;
  skipped: number;
  errors: number;
}

interface ProfitabilityResult {
  shouldExecute: boolean;
  profit: number;
  currency: string;
  conversionRate?: number;
  profitJpy?: number;
}

async function checkProfitability(
  decision: InvestmentDecision,
  currentPrice: number,
  log: pino.Logger,
): Promise<ProfitabilityResult> {
  const currency = getQuoteCurrency(decision.ticker);

  if (decision.action === "SELL") {
    const lastBuy = await getLastTradeByTickerAndSide(decision.ticker, "BUY");
    if (!lastBuy) {
      log.info({ ticker: decision.ticker }, "No previous BUY found — skipping SELL");
      return { shouldExecute: false, profit: 0, currency };
    }
    if (currentPrice <= lastBuy.Price) {
      log.info(
        {
          ticker: decision.ticker,
          currentPrice,
          lastBuyPrice: lastBuy.Price,
        },
        "Current price is not above last BUY price — skipping SELL to avoid loss",
      );
      return { shouldExecute: false, profit: 0, currency };
    }
    const rawProfit = currentPrice - lastBuy.Price;
    let profit = rawProfit;
    let profitJpy: number | undefined;
    let conversionRate: number | undefined;

    if (currency === "BTC") {
      const btcJpyRate = await getBtcJpyRate();
      if (btcJpyRate == null) {
        log.warn(
          { ticker: decision.ticker, currency, rawProfit },
          "BTC/JPY rate unavailable — using raw profit",
        );
      } else {
        const converted = convertToJpy(rawProfit, currency, btcJpyRate);
        if (converted == null) {
          log.warn(
            { ticker: decision.ticker, currency, rawProfit, btcJpyRate },
            "Failed to convert BTC profit to JPY — using raw profit",
          );
        } else {
          profit = converted;
          profitJpy = converted;
          conversionRate = btcJpyRate;
        }
      }
    } else {
      const converted = convertToJpy(rawProfit, currency);
      if (converted != null) {
        profit = converted;
        profitJpy = converted;
      }
    }

    log.info(
      {
        ticker: decision.ticker,
        currentPrice,
        lastBuyPrice: lastBuy.Price,
        rawProfit,
        profit,
        profitJpy,
        currency,
        conversionRate,
      },
      "Profitable SELL opportunity detected",
    );
    return { shouldExecute: true, profit, currency, conversionRate, profitJpy };
  }

  if (decision.action === "BUY") {
    return { shouldExecute: true, profit: 0, currency };
  }

  return { shouldExecute: false, profit: 0, currency };
}

export async function executeTradeHandler(
  decision: InvestmentDecision,
  config: AppConfig,
  marketPrice?: number,
): Promise<ExecuteTradeHandlerResult> {
  const log = logger.child({ handler: "execute-trade" });

  if (decision.confidence < config.confidenceThreshold) {
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

    const positions = await getAllPositions();
    let totalPortfolioJpy = 0;
    for (const pos of positions) {
      totalPortfolioJpy += pos.TotalInvestedJPY;
    }

    const MIN_PORTFOLIO_JPY = 10000;
    const effectivePortfolio = Math.max(totalPortfolioJpy, MIN_PORTFOLIO_JPY);

    const orderValueJpy = decision.confidence * config.maxAllocationPercent * effectivePortfolio;

    const isJpyPair = decision.ticker.endsWith("/JPY");
    let amount: number;
    if (isJpyPair) {
      amount = price > 0 ? orderValueJpy / price : 0;
    } else {
      const btcJpyRate = await getBtcJpyRate();
      if (btcJpyRate == null || btcJpyRate <= 0) {
        log.warn(
          { ticker: decision.ticker },
          "Cannot calculate BTC order size — BTC/JPY rate unavailable",
        );
        return { executed: 0, skipped: 1, errors: 0 };
      }
      const orderValueBtc = orderValueJpy / btcJpyRate;
      amount = price > 0 ? orderValueBtc / price : 0;
    }

    if (amount <= 0) {
      log.warn(
        { ticker: decision.ticker, marketPrice, targetPrice: decision.targetPrice },
        "Cannot calculate order amount — no valid price",
      );
      return { executed: 0, skipped: 1, errors: 0 };
    }

    const profitCheck = await checkProfitability(decision, price, log);
    if (!profitCheck.shouldExecute) {
      return { executed: 0, skipped: 1, errors: 0 };
    }

    const positionSide: "long" | "short" = "long";
    const leverage = 1;

    const orderRequest: OrderRequest = {
      symbol: decision.ticker,
      side: decision.action === "BUY" ? "buy" : "sell",
      positionSide,
      amount,
      price: marketPrice ?? decision.targetPrice,
      type: "market",
      leverage,
      marginMode: config.marginMode,
    };

    const result = await executeTrade(orderRequest, config, decision, profitCheck);

    log.info(
      {
        orderId: result.orderId,
        symbol: result.symbol,
        side: result.side,
        positionSide: result.positionSide,
        leverage: result.leverage,
        executedPrice: result.executedPrice,
        isPaperTrade: result.isPaperTrade,
        profit: profitCheck.profit,
        profitJpy: profitCheck.profitJpy,
        currency: profitCheck.currency,
        conversionRate: profitCheck.conversionRate,
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
  tradingPairs: TRADING_PAIRS,
  confidenceThreshold: env.CONFIDENCE_THRESHOLD,
  maxOrderValueBtc: env.MAX_ORDER_VALUE_BTC,
  maxOrderValueJpy: env.MAX_ORDER_VALUE_JPY,
  maxAllocationPercent: env.MAX_ALLOCATION_PERCENT,
  maxLeverage: env.MAX_LEVERAGE,
  marginMode: env.MARGIN_MODE,
  enableShortSelling: env.ENABLE_SHORT_SELLING,
});

export const handler: ScheduledHandler = async (event: ScheduledEvent) => {
  // In Step Functions, event detail contains the decision
  const decision = InvestmentDecisionSchema.parse(
    (event as unknown as Record<string, unknown>).detail ?? event,
  );
  await executeTradeHandler(decision, defaultConfig);
};
