import type { ScheduledEvent, ScheduledHandler } from "aws-lambda";
import { env } from "../config/env.js";
import { RSS_FEEDS } from "../config/rss-feeds.js";
import { TRADING_PAIRS } from "../config/trading-pairs.js";
import { convertToJpy, getBtcJpyRate, getQuoteCurrency } from "../lib/currency-converter.js";
import { logger } from "../lib/logger.js";
import { fetchMultiTimeframeData } from "../providers/multi-timeframe-market.js";
import { getAllPositions, getPosition } from "../repositories/position-repository.js";
import {
  removeStopLoss,
  saveScalpTrade,
  saveStopLoss,
} from "../repositories/scalp-trade-repository.js";
import type { InvestmentDecision } from "../schemas/ai.js";
import { type AppConfig, AppConfigSchema } from "../schemas/config.js";
import type { OrderRequest } from "../schemas/trade.js";
import { analyzeScalp } from "../services/scalp-analyzer.js";
import { filterByTechnicalSignals } from "../services/scalp-signal-filter.js";
import { executeTrade } from "../services/trader.js";

const log = logger.child({ handler: "scalp-analyze" });

export interface ScalpAnalyzeHandlerResult {
  fetched: number;
  filtered: number;
  analyzed: number;
  traded: number;
  skipped: number;
  errors: number;
}

function toInvestmentDecision(
  ticker: string,
  action: "BUY" | "SELL",
  confidence: number,
  reasoning: string,
  targetPrice: number | undefined,
): InvestmentDecision {
  return {
    ticker,
    action,
    confidence,
    reasoning,
    targetPrice,
    riskLevel: "MEDIUM",
    timeHorizon: "SHORT",
    positionSide: "LONG",
    leverage: 1,
    promptVersion: "scalp-v1",
  };
}

async function calculateBuyAmount(
  config: AppConfig,
  ticker: string,
  price: number,
): Promise<number> {
  if (price <= 0) {
    return 0;
  }

  const positions = await getAllPositions();
  const totalPortfolioJpy = positions.reduce((sum, position) => sum + position.TotalInvestedJPY, 0);
  const effectivePortfolioJpy = Math.max(totalPortfolioJpy, 10000);
  const orderValueJpy = config.maxAllocationPercent * effectivePortfolioJpy;

  if (ticker.endsWith("/JPY")) {
    return orderValueJpy / price;
  }

  const btcJpyRate = await getBtcJpyRate();
  if (btcJpyRate == null || btcJpyRate <= 0) {
    log.warn({ ticker }, "BTC/JPY rate unavailable — skipping BUY");
    return 0;
  }

  const orderValueBtc = orderValueJpy / btcJpyRate;
  return orderValueBtc / price;
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

async function executeBuy(
  config: AppConfig,
  ticker: string,
  price: number,
  stopLossPrice: number,
  takeProfitPrice: number | undefined,
  confidence: number,
  reasoning: string,
  entryTimeframe: string,
  trendAlignment: string,
  signals: string[],
): Promise<boolean> {
  const existingPosition = await getPosition(ticker);
  if (existingPosition && existingPosition.Amount > 0) {
    log.info({ ticker }, "Skipping BUY — position already open");
    return false;
  }

  const amount = await calculateBuyAmount(config, ticker, price);
  if (amount <= 0) {
    log.warn({ ticker, price }, "Skipping BUY — unable to calculate order amount");
    return false;
  }

  const decision = toInvestmentDecision(ticker, "BUY", confidence, reasoning, price);
  const orderRequest: OrderRequest = {
    symbol: ticker,
    side: "buy",
    positionSide: "long",
    amount,
    price,
    type: "market",
    leverage: 1,
    marginMode: config.marginMode,
  };

  const result = await executeTrade(orderRequest, config, decision, {
    profit: 0,
    currency: getQuoteCurrency(ticker),
  });

  const status = result.isPaperTrade ? "PAPER" : "OPEN";
  const quoteCurrency = getQuoteCurrency(ticker);

  await saveScalpTrade({
    ticker,
    side: "BUY",
    price: result.executedPrice,
    stopLossPrice,
    takeProfitPrice,
    currency: quoteCurrency,
    orderId: result.orderId,
    status,
    confidence,
    entryTimeframe,
    trendAlignment,
    signals,
  });

  await saveStopLoss({
    ticker,
    entryPrice: result.executedPrice,
    stopLossPrice,
    takeProfitPrice,
    amount: result.amount,
    orderId: result.orderId,
    currency: quoteCurrency,
  });

  return true;
}

async function executeSell(
  config: AppConfig,
  ticker: string,
  price: number,
  confidence: number,
  reasoning: string,
  entryTimeframe: string,
  trendAlignment: string,
  signals: string[],
): Promise<boolean> {
  const position = await getPosition(ticker);
  if (!position || position.Amount <= 0) {
    log.info({ ticker }, "Skipping SELL — no open position");
    return false;
  }

  const decision = toInvestmentDecision(ticker, "SELL", confidence, reasoning, price);
  const orderRequest: OrderRequest = {
    symbol: ticker,
    side: "sell",
    positionSide: "long",
    amount: position.Amount,
    price,
    type: "market",
    leverage: 1,
    marginMode: config.marginMode,
  };

  const profitInfo = await calculateProfitInfo(
    position.AvgBuyPrice,
    price,
    position.Amount,
    ticker,
  );
  const result = await executeTrade(orderRequest, config, decision, profitInfo);
  const status = result.isPaperTrade ? "PAPER" : "CLOSED";

  await saveScalpTrade({
    ticker,
    side: "SELL",
    price: result.executedPrice,
    stopLossPrice: position.AvgBuyPrice,
    profit: profitInfo.profit,
    profitJpy: profitInfo.profitJpy,
    currency: profitInfo.currency,
    conversionRate: profitInfo.conversionRate,
    orderId: result.orderId,
    status,
    confidence,
    entryTimeframe,
    trendAlignment,
    signals,
  });

  await removeStopLoss(ticker);
  return true;
}

export async function scalpAnalyzeHandler(config: AppConfig): Promise<ScalpAnalyzeHandlerResult> {
  if (!config.scalpEnabled) {
    log.info("Scalping disabled — skipping cycle");
    return { fetched: 0, filtered: 0, analyzed: 0, traded: 0, skipped: 0, errors: 0 };
  }

  const pairs = config.tradingPairs.filter((pair) => pair.enabled && pair.assetType === "crypto");
  const marketData = await Promise.all(
    pairs.map(async (pair) => fetchMultiTimeframeData(pair.symbol)),
  );
  const availableData = marketData.filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );
  const filteredPairs = filterByTechnicalSignals(availableData, config.scalpMaxPairsPerCycle);
  const positions = await getAllPositions();

  let analyzed = 0;
  let traded = 0;
  let skipped = 0;
  let errors = 0;

  for (const pair of filteredPairs) {
    try {
      const pairData = availableData.find((candidate) => candidate.symbol === pair.symbol);
      if (!pairData) {
        skipped += 1;
        continue;
      }

      const decision = await analyzeScalp({
        symbol: pair.symbol,
        timeframes: pairData.timeframes.map((timeframe) => ({
          timeframe: timeframe.timeframe,
          indicators: timeframe.indicators,
          latestClose: timeframe.latestClose,
          latestVolume: timeframe.latestVolume,
        })),
        positions: positions.map((position) => ({
          ticker: position.Ticker,
          amount: position.Amount,
          avgBuyPrice: position.AvgBuyPrice,
          currency: position.Currency,
        })),
        filterSignals: pair.signals,
      });

      analyzed += 1;

      if (decision.action === "HOLD" || decision.confidence < config.scalpConfidenceThreshold) {
        skipped += 1;
        continue;
      }

      const primaryTimeframe =
        pairData.timeframes.find((timeframe) => timeframe.timeframe === decision.entryTimeframe) ??
        pairData.timeframes.find((timeframe) => timeframe.timeframe === "1m") ??
        pairData.timeframes[0];

      const currentPrice = decision.targetPrice ?? primaryTimeframe?.latestClose ?? 0;
      if (currentPrice <= 0) {
        skipped += 1;
        continue;
      }

      const executed =
        decision.action === "BUY"
          ? await executeBuy(
              config,
              decision.ticker,
              currentPrice,
              decision.stopLossPrice,
              decision.takeProfitPrice,
              decision.confidence,
              decision.reasoning,
              decision.entryTimeframe,
              decision.trendAlignment,
              pair.signals,
            )
          : await executeSell(
              config,
              decision.ticker,
              currentPrice,
              decision.confidence,
              decision.reasoning,
              decision.entryTimeframe,
              decision.trendAlignment,
              pair.signals,
            );

      if (executed) {
        traded += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      errors += 1;
      log.error({ error, symbol: pair.symbol }, "Failed to process scalp analysis pair");
    }
  }

  const result = {
    fetched: availableData.length,
    filtered: filteredPairs.length,
    analyzed,
    traded,
    skipped,
    errors,
  };

  log.info(result, "Scalp analysis cycle completed");
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
  await scalpAnalyzeHandler(defaultConfig);
};
