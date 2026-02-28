import ccxt from "ccxt";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { updateState } from "../repositories/state-repository.js";
import { type SaveTradeOptions, saveTradeItem } from "../repositories/trade-repository.js";
import type { InvestmentDecision } from "../schemas/ai.js";
import type { AppConfig } from "../schemas/config.js";
import { type OrderRequest, type OrderResult, OrderResultSchema } from "../schemas/trade.js";
import { getTracer } from "../lib/tracer.js";
import { SpanStatusCode } from "@opentelemetry/api";

const log = logger.child({ service: "trader" });

/**
 * ペーパートレード: 実際には発注せず疑似的な結果を返す
 */
function executePaperTrade(request: OrderRequest): OrderResult {
  const executedPrice = request.price ?? 0;

  if (executedPrice === 0) {
    log.warn({ symbol: request.symbol }, "Paper trade executed with price 0 — no price provided");
  }

  return OrderResultSchema.parse({
    orderId: `paper-${Date.now()}`,
    symbol: request.symbol,
    side: request.side,
    amount: request.amount,
    executedPrice,
    status: "closed",
    timestamp: new Date().toISOString(),
    isPaperTrade: true,
  });
}

/**
 * 実トレード: ccxt を使って取引所に発注する
 */
async function executeLiveTrade(request: OrderRequest): Promise<OrderResult> {
  const exchangeId = env.EXCHANGE_ID ?? "binance";

  // biome-ignore lint/suspicious/noExplicitAny: ccxt dynamic exchange instantiation
  const ExchangeClass = (ccxt as any)[exchangeId];
  if (!ExchangeClass) {
    throw new Error(`Exchange '${exchangeId}' not found in ccxt`);
  }

  const exchange = new ExchangeClass({
    apiKey: env.EXCHANGE_API_KEY,
    secret: env.EXCHANGE_SECRET,
    enableRateLimit: true,
  });

  // 残高確認
  const balance = await exchange.fetchBalance();
  log.info({ free: balance.free, symbol: request.symbol }, "Exchange balance fetched");

  // 発注
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
    amount: request.amount,
    executedPrice,
    status: order.status as string,
    timestamp: new Date().toISOString(),
    isPaperTrade: false,
  });
}

/**
 * 取引を実行する（ペーパー or 実弾モード）
 *
 * 1. PAPER_TRADE モードの場合は疑似発注
 * 2. それ以外は ccxt を使って取引所に発注
 * 3. 結果を DynamoDB に保存
 * 4. 残高状態を更新
 */
export async function executeTrade(
  request: OrderRequest,
  config: AppConfig,
  decision: InvestmentDecision,
): Promise<OrderResult> {
  const tracer = getTracer();
  return tracer.startActiveSpan("trade.execute", async (span) => {
    try {
      span.setAttribute("trade.symbol", request.symbol);
      span.setAttribute("trade.side", request.side);
      span.setAttribute("trade.paper", env.PAPER_TRADE);

      log.info(
        {
          symbol: request.symbol,
          side: request.side,
          amount: request.amount,
          paperTrade: env.PAPER_TRADE,
        },
        "Executing trade",
      );

      const result = env.PAPER_TRADE ? executePaperTrade(request) : await executeLiveTrade(request);

      // DynamoDB に取引結果を保存
      const saveOptions: SaveTradeOptions = {
        decision,
        executedPrice: result.executedPrice,
        orderId: result.orderId,
        isPaper: result.isPaperTrade,
      };
      await saveTradeItem(saveOptions);

      // 残高状態を更新 (executedPrice * amount を概算として使用)
      const tradeValue = result.executedPrice * result.amount;
      await updateState(tradeValue);

      span.setAttribute("trade.orderId", result.orderId);
      span.setAttribute("trade.executedPrice", result.executedPrice);

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
