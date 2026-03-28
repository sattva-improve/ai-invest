import { SpanStatusCode } from "@opentelemetry/api";
import ccxt from "ccxt";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { getTracer } from "../lib/tracer.js";
import { updateState } from "../repositories/state-repository.js";
import { type SaveTradeOptions, saveTradeItem } from "../repositories/trade-repository.js";
import type { InvestmentDecision } from "../schemas/ai.js";
import type { AppConfig } from "../schemas/config.js";
import { type OrderRequest, type OrderResult, OrderResultSchema } from "../schemas/trade.js";

const log = logger.child({ service: "trader" });

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

  const balance = await exchange.fetchBalance();
  log.info({ free: balance.free, symbol: request.symbol }, "Exchange balance fetched");

  const order = await exchange.createOrder(
    request.symbol,
    request.type,
    request.side,
    request.amount,
    request.price,
  );

  const executedPrice =
    (order.average as number | undefined) ?? (order.price as number | undefined) ?? 0;

  return OrderResultSchema.parse({
    orderId: order.id as string,
    symbol: request.symbol,
    side: request.side,
    positionSide: request.positionSide,
    amount: request.amount,
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
      };
      await saveTradeItem(saveOptions);

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
