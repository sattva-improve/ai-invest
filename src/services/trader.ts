import { SpanStatusCode } from "@opentelemetry/api";
import ccxt from "ccxt";
import { env } from "../config/env.js";
import { convertToJpy, getBtcJpyRate, getQuoteCurrency } from "../lib/currency-converter.js";
import { logger } from "../lib/logger.js";
import { getTracer } from "../lib/tracer.js";
import { addToPosition, reducePosition } from "../repositories/position-repository.js";
import { updateState } from "../repositories/state-repository.js";
import { type SaveTradeOptions, saveTradeItem } from "../repositories/trade-repository.js";
import type { InvestmentDecision } from "../schemas/ai.js";
import type { AppConfig } from "../schemas/config.js";
import { type OrderRequest, type OrderResult, OrderResultSchema } from "../schemas/trade.js";

const log = logger.child({ service: "trader" });

interface ProfitInfo {
  profit: number;
  currency: string;
  profitJpy?: number;
  conversionRate?: number;
}

function executePaperTrade(request: OrderRequest): OrderResult {
  const executedPrice = request.price ?? 0;

  if (executedPrice === 0) {
    log.warn({ symbol: request.symbol }, "Paper trade executed with price 0 — no price provided");
  }

  return OrderResultSchema.parse({
    orderId: `paper-${Date.now()}`,
    symbol: request.symbol,
    side: request.side,
    positionSide: request.positionSide,
    amount: request.amount,
    executedPrice,
    leverage: request.leverage,
    status: "closed",
    timestamp: new Date().toISOString(),
    isPaperTrade: true,
  });
}

async function getExchangeInstance(): Promise<InstanceType<typeof ccxt.Exchange>> {
  const exchangeId = env.EXCHANGE_ID ?? "binance";

  // biome-ignore lint/suspicious/noExplicitAny: ccxt dynamic exchange instantiation
  const ExchangeClass = (ccxt as any)[exchangeId];
  if (!ExchangeClass) {
    throw new Error(`Exchange '${exchangeId}' not found in ccxt`);
  }

  const apiKey = env.EXCHANGE_API_KEY;
  const secret = env.EXCHANGE_SECRET;

  return new ExchangeClass({
    apiKey,
    secret,
    enableRateLimit: true,
    options: {
      adjustForTimeDifference: true,
      defaultType: "spot",
    },
  });
}

async function executeLiveTrade(request: OrderRequest): Promise<OrderResult> {
  const exchange = await getExchangeInstance();

  await exchange.loadTimeDifference();
  await exchange.loadMarkets();

  const market = exchange.market(request.symbol);
  const normalizedAmount = Number(exchange.amountToPrecision(request.symbol, request.amount));
  const normalizedPrice =
    typeof request.price === "number"
      ? Number(exchange.priceToPrecision(request.symbol, request.price))
      : undefined;

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error(`Invalid normalized amount for ${request.symbol}: ${normalizedAmount}`);
  }

  const minAmount = market.limits?.amount?.min;
  if (typeof minAmount === "number" && normalizedAmount < minAmount) {
    throw new Error(
      `Order amount ${normalizedAmount} is below minimum ${minAmount} for ${request.symbol}`,
    );
  }

  const effectivePrice = normalizedPrice ?? market.info?.lastPrice;
  const estimatedCost = effectivePrice ? normalizedAmount * Number(effectivePrice) : undefined;
  const minCost = market.limits?.cost?.min;
  if (
    typeof minCost === "number" &&
    typeof estimatedCost === "number" &&
    Number.isFinite(estimatedCost) &&
    estimatedCost < minCost
  ) {
    throw new Error(
      `Order notional ${estimatedCost} is below minimum ${minCost} for ${request.symbol}`,
    );
  }

  const balance = await exchange.fetchBalance();
  log.info({ free: balance.free, symbol: request.symbol }, "Exchange balance fetched");

  const order = await exchange.createOrder(
    request.symbol,
    request.type,
    request.side,
    normalizedAmount,
    normalizedPrice,
  );

  const executedPrice =
    (order.average as number | undefined) ?? (order.price as number | undefined) ?? 0;

  return OrderResultSchema.parse({
    orderId: order.id as string,
    symbol: request.symbol,
    side: request.side,
    positionSide: request.positionSide,
    amount: normalizedAmount,
    executedPrice,
    leverage: request.leverage,
    status: order.status as string,
    timestamp: new Date().toISOString(),
    isPaperTrade: false,
  });
}

export async function executeTrade(
  request: OrderRequest,
  _config: AppConfig,
  decision: InvestmentDecision,
  profitInfo: ProfitInfo = { profit: 0, currency: "UNKNOWN" },
): Promise<OrderResult> {
  const tracer = getTracer();
  return tracer.startActiveSpan("trade.execute", async (span) => {
    try {
      span.setAttribute("trade.symbol", request.symbol);
      span.setAttribute("trade.side", request.side);
      span.setAttribute("trade.positionSide", request.positionSide);
      span.setAttribute("trade.leverage", request.leverage);
      span.setAttribute("trade.paper", env.PAPER_TRADE);

      log.info(
        {
          symbol: request.symbol,
          side: request.side,
          positionSide: request.positionSide,
          leverage: request.leverage,
          amount: request.amount,
          paperTrade: env.PAPER_TRADE,
        },
        "Executing trade",
      );

      const result = env.PAPER_TRADE ? executePaperTrade(request) : await executeLiveTrade(request);

      const saveOptions: SaveTradeOptions = {
        decision,
        executedPrice: result.executedPrice,
        orderId: result.orderId,
        isPaper: result.isPaperTrade,
        profit: profitInfo.profit,
        currency: profitInfo.currency,
        profitJpy: profitInfo.profitJpy,
        conversionRate: profitInfo.conversionRate,
      };
      await saveTradeItem(saveOptions);

      try {
        if (request.side === "buy") {
          const quoteCurrency = getQuoteCurrency(request.symbol);
          const amountInQuoteCurrency = result.amount * result.executedPrice;
          let jpyEquivalent = amountInQuoteCurrency;

          if (quoteCurrency === "BTC") {
            const btcJpyRate = await getBtcJpyRate();
            const converted = convertToJpy(
              amountInQuoteCurrency,
              quoteCurrency,
              btcJpyRate ?? undefined,
            );
            if (converted == null) {
              throw new Error("Failed to convert BTC position value to JPY");
            }
            jpyEquivalent = converted;
          } else if (quoteCurrency === "JPY") {
            jpyEquivalent = amountInQuoteCurrency;
          } else {
            const converted = convertToJpy(amountInQuoteCurrency, quoteCurrency);
            if (converted != null) {
              jpyEquivalent = converted;
            }
          }

          await addToPosition(
            request.symbol,
            result.amount,
            result.executedPrice,
            quoteCurrency,
            jpyEquivalent,
          );
        } else if (request.side === "sell") {
          await reducePosition(request.symbol, result.amount);
        }
      } catch (positionError) {
        log.error(
          { error: positionError, symbol: request.symbol, side: request.side },
          "Position tracking failed after successful trade",
        );
      }

      const tradeValue = result.executedPrice * result.amount;
      await updateState(tradeValue);

      span.setAttribute("trade.orderId", result.orderId);
      span.setAttribute("trade.executedPrice", result.executedPrice);

      log.info(
        {
          orderId: result.orderId,
          symbol: result.symbol,
          side: result.side,
          positionSide: result.positionSide,
          leverage: result.leverage,
          executedPrice: result.executedPrice,
          isPaperTrade: result.isPaperTrade,
        },
        "Trade executed successfully",
      );

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      throw err;
    } finally {
      span.end();
    }
  });
}
