import type { ScheduledEvent, ScheduledHandler } from "aws-lambda";
import { env } from "../config/env.js";
import { RSS_FEEDS } from "../config/rss-feeds.js";
import { TRADING_PAIRS } from "../config/trading-pairs.js";
import { convertToJpy, getBtcJpyRate, getQuoteCurrency } from "../lib/currency-converter.js";
import { logger } from "../lib/logger.js";
import { getCryptoMarketData } from "../providers/crypto-market.js";
import { getPosition } from "../repositories/position-repository.js";
import {
  getAllActiveStopLosses,
  removeStopLoss,
  saveScalpTrade,
} from "../repositories/scalp-trade-repository.js";
import type { InvestmentDecision } from "../schemas/ai.js";
import { type AppConfig, AppConfigSchema } from "../schemas/config.js";
import type { OrderRequest } from "../schemas/trade.js";
import { executeTrade } from "../services/trader.js";

const log = logger.child({ handler: "stop-loss-monitor" });

export interface StopLossMonitorHandlerResult {
  checked: number;
  triggered: number;
  remaining: number;
  errors: number;
}

function toInvestmentDecision(ticker: string, price: number, reason: string): InvestmentDecision {
  return {
    ticker,
    action: "SELL",
    confidence: 1,
    reasoning: reason,
    targetPrice: price,
    riskLevel: "MEDIUM",
    timeHorizon: "SHORT",
    positionSide: "LONG",
    leverage: 1,
    promptVersion: "scalp-stop-loss",
  };
}

async function calculateProfitInfo(
  entryPrice: number,
  exitPrice: number,
  amount: number,
  ticker: string,
) {
  const currency = getQuoteCurrency(ticker);
  const profit = (exitPrice - entryPrice) * amount;

  if (currency === "JPY") {
    return {
      profit,
      currency,
      profitJpy: profit,
      conversionRate: undefined as number | undefined,
    };
  }

  if (currency === "BTC") {
    const btcJpyRate = await getBtcJpyRate();
    const profitJpy = btcJpyRate != null ? convertToJpy(profit, currency, btcJpyRate) : null;
    return {
      profit,
      currency,
      profitJpy: profitJpy ?? undefined,
      conversionRate: btcJpyRate ?? undefined,
    };
  }

  return {
    profit,
    currency,
    profitJpy: convertToJpy(profit, currency) ?? undefined,
    conversionRate: undefined as number | undefined,
  };
}

export async function stopLossMonitorHandler(
  config: AppConfig,
): Promise<StopLossMonitorHandlerResult> {
  if (!config.scalpEnabled) {
    log.info("Scalping disabled — skipping stop-loss monitor");
    return { checked: 0, triggered: 0, remaining: 0, errors: 0 };
  }

  const activeStops = await getAllActiveStopLosses();
  if (activeStops.length === 0) {
    return { checked: 0, triggered: 0, remaining: 0, errors: 0 };
  }

  let checked = 0;
  let triggered = 0;
  let errors = 0;

  for (const stop of activeStops) {
    checked += 1;

    try {
      const position = await getPosition(stop.Ticker);
      if (!position || position.Amount <= 0) {
        await removeStopLoss(stop.Ticker);
        continue;
      }

      const marketData = await getCryptoMarketData(stop.Ticker);
      const currentPrice = marketData?.price ?? 0;
      if (currentPrice <= 0) {
        continue;
      }

      const hitStopLoss = currentPrice <= stop.StopLossPrice;
      const hitTakeProfit =
        typeof stop.TakeProfitPrice === "number" && currentPrice >= stop.TakeProfitPrice;

      if (!hitStopLoss && !hitTakeProfit) {
        continue;
      }

      const decision = toInvestmentDecision(
        stop.Ticker,
        currentPrice,
        hitStopLoss ? "ATR stop-loss triggered" : "Take-profit target reached",
      );
      const orderRequest: OrderRequest = {
        symbol: stop.Ticker,
        side: "sell",
        positionSide: "long",
        amount: position.Amount,
        price: currentPrice,
        type: "market",
        leverage: 1,
        marginMode: config.marginMode,
      };

      const profitInfo = await calculateProfitInfo(
        stop.EntryPrice,
        currentPrice,
        position.Amount,
        stop.Ticker,
      );
      const result = await executeTrade(orderRequest, config, decision, profitInfo);
      const status = result.isPaperTrade ? "PAPER" : hitStopLoss ? "STOPPED_OUT" : "CLOSED";

      await saveScalpTrade({
        ticker: stop.Ticker,
        side: "SELL",
        price: result.executedPrice,
        stopLossPrice: stop.StopLossPrice,
        takeProfitPrice: stop.TakeProfitPrice,
        profit: profitInfo.profit,
        profitJpy: profitInfo.profitJpy,
        currency: profitInfo.currency,
        conversionRate: profitInfo.conversionRate,
        orderId: result.orderId,
        status,
        confidence: 1,
        entryTimeframe: "1m",
        trendAlignment: hitStopLoss ? "CONFLICTING" : "ALIGNED",
        signals: [hitStopLoss ? "Stop-loss triggered" : "Take-profit triggered"],
      });

      await removeStopLoss(stop.Ticker);
      triggered += 1;
    } catch (error) {
      errors += 1;
      log.error({ error, ticker: stop.Ticker }, "Failed to process stop-loss entry");
    }
  }

  const remaining = (await getAllActiveStopLosses()).length;
  const result = { checked, triggered, remaining, errors };
  log.info(result, "Stop-loss monitor cycle completed");
  return result;
}

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
  scalpEnabled: env.SCALP_ENABLED,
  scalpIntervalMinutes: env.SCALP_INTERVAL_MINUTES,
  scalpConfidenceThreshold: env.SCALP_CONFIDENCE_THRESHOLD,
  scalpModelId: env.SCALP_MODEL_ID,
  scalpMaxPairsPerCycle: env.SCALP_MAX_PAIRS_PER_CYCLE,
  scalpStoplossMonitorSeconds: env.SCALP_STOPLOSS_MONITOR_SECONDS,
  scalpAtrMultiplier: env.SCALP_ATR_MULTIPLIER,
});

export const handler: ScheduledHandler = async (_event: ScheduledEvent) => {
  await stopLossMonitorHandler(defaultConfig);
};
