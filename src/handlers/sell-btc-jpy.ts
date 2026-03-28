/**
 * Manual BTC → JPY sell script.
 *
 * Usage:
 *   npx tsx src/handlers/sell-btc-jpy.ts [amount_jpy]
 *
 * Examples:
 *   npx tsx src/handlers/sell-btc-jpy.ts        # sells 200 JPY worth (default)
 *   npx tsx src/handlers/sell-btc-jpy.ts 100    # sells 100 JPY worth
 *   npx tsx src/handlers/sell-btc-jpy.ts 300    # sells 300 JPY worth
 */
import ccxt from "ccxt";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ handler: "sell-btc-jpy" });

const SYMBOL = "BTC/JPY";
const DEFAULT_JPY_AMOUNT = 200;
const MIN_JPY_AMOUNT = 150;
const MAX_JPY_AMOUNT = 300;

async function getPublicExchange(): Promise<InstanceType<typeof ccxt.Exchange>> {
  const exchangeId = env.EXCHANGE_ID ?? "binance";

  // biome-ignore lint/suspicious/noExplicitAny: ccxt dynamic exchange instantiation
  const ExchangeClass = (ccxt as any)[exchangeId];
  if (!ExchangeClass) {
    throw new Error(`Exchange '${exchangeId}' not found in ccxt`);
  }

  return new ExchangeClass({
    enableRateLimit: true,
    options: {
      adjustForTimeDifference: true,
      defaultType: "spot",
    },
  });
}

async function getAuthenticatedExchange(): Promise<InstanceType<typeof ccxt.Exchange>> {
  const exchangeId = env.EXCHANGE_ID ?? "binance";

  // biome-ignore lint/suspicious/noExplicitAny: ccxt dynamic exchange instantiation
  const ExchangeClass = (ccxt as any)[exchangeId];
  if (!ExchangeClass) {
    throw new Error(`Exchange '${exchangeId}' not found in ccxt`);
  }

  return new ExchangeClass({
    apiKey: env.EXCHANGE_API_KEY,
    secret: env.EXCHANGE_SECRET,
    enableRateLimit: true,
    options: {
      adjustForTimeDifference: true,
      defaultType: "spot",
    },
  });
}

export async function sellBtcForJpy(jpyAmount: number): Promise<void> {
  if (jpyAmount < MIN_JPY_AMOUNT || jpyAmount > MAX_JPY_AMOUNT) {
    throw new Error(
      `JPY amount must be between ${MIN_JPY_AMOUNT} and ${MAX_JPY_AMOUNT}, got ${jpyAmount}`,
    );
  }

  const publicExchange = await getPublicExchange();
  await publicExchange.loadTimeDifference();

  const ticker = await publicExchange.fetchTicker(SYMBOL);
  const btcPrice = ticker.last;
  if (!btcPrice || btcPrice <= 0) {
    throw new Error(`Failed to fetch BTC/JPY price: ${btcPrice}`);
  }

  const btcAmount = jpyAmount / btcPrice;

  const market = publicExchange.market(SYMBOL);
  const minAmount = market.limits?.amount?.min;
  if (minAmount && btcAmount < minAmount) {
    throw new Error(
      `Calculated BTC amount (${btcAmount.toFixed(8)}) is below exchange minimum (${minAmount}). ` +
        `Need at least ${Math.ceil(minAmount * btcPrice)} JPY.`,
    );
  }

  if (env.PAPER_TRADE) {
    log.info(
      {
        symbol: SYMBOL,
        side: "sell",
        btcAmount: btcAmount.toFixed(8),
        estimatedJpy: jpyAmount,
        btcPrice,
      },
      "[PAPER TRADE] BTC → JPY sell simulated",
    );
    return;
  }

  const exchange = await getAuthenticatedExchange();
  await exchange.loadTimeDifference();

  const balance = await exchange.fetchBalance();
  const freeBtc = Number(balance.BTC?.free ?? 0);
  if (freeBtc < btcAmount) {
    throw new Error(
      `Insufficient BTC balance. Need ${btcAmount.toFixed(8)} BTC, have ${freeBtc} BTC`,
    );
  }

  log.info(
    {
      jpyAmount,
      btcPrice,
      btcAmount: btcAmount.toFixed(8),
      freeBtc,
    },
    "Executing BTC → JPY sell order",
  );

  const order = await exchange.createOrder(SYMBOL, "market", "sell", btcAmount);

  const executedPrice =
    (order.average as number | undefined) ?? (order.price as number | undefined);
  const filledAmount = (order.filled as number | undefined) ?? btcAmount;
  const receivedJpy = executedPrice ? filledAmount * executedPrice : jpyAmount;

  log.info(
    {
      orderId: order.id,
      symbol: SYMBOL,
      side: "sell",
      btcAmount: filledAmount,
      executedPrice,
      receivedJpy: Math.round(receivedJpy),
      status: order.status,
    },
    "BTC → JPY sell order executed",
  );
}

function isExecutedAsEntrypoint(): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  return import.meta.url === new URL(`file://${entryPath}`).href;
}

if (isExecutedAsEntrypoint()) {
  const arg = process.argv[2];
  const jpyAmount = arg ? Number.parseInt(arg, 10) : DEFAULT_JPY_AMOUNT;

  if (Number.isNaN(jpyAmount)) {
    console.error(
      `Invalid amount: "${arg}". Usage: npx tsx src/handlers/sell-btc-jpy.ts [100-300]`,
    );
    process.exit(1);
  }

  sellBtcForJpy(jpyAmount)
    .then(() => {
      log.info("Done");
      process.exit(0);
    })
    .catch((err) => {
      log.error({ err }, "Failed to sell BTC for JPY");
      process.exit(1);
    });
}
