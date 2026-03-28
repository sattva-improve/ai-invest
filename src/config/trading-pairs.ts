import type { TradingPair } from "../schemas/config.js";

/**
 * Default trading pairs — shared across all handlers.
 *
 * Includes both JPY-denominated and BTC-denominated pairs.
 * - JPY pairs: Available on Binance Japan / domestic exchanges
 * - BTC pairs: Available on Binance Global
 *
 * Edit this single list to add/remove pairs system-wide.
 */
export const TRADING_PAIRS: TradingPair[] = [
  // JPY-denominated pairs (Binance — confirmed available)
  { symbol: "BTC/JPY", exchange: "binance", assetType: "crypto", enabled: true },
  { symbol: "ETH/JPY", exchange: "binance", assetType: "crypto", enabled: true },
  { symbol: "BNB/JPY", exchange: "binance", assetType: "crypto", enabled: true },

  // BTC-denominated pairs (Binance Global)
  { symbol: "ETH/BTC", exchange: "binance", assetType: "crypto", enabled: true },
  { symbol: "SOL/BTC", exchange: "binance", assetType: "crypto", enabled: true },
  { symbol: "XRP/BTC", exchange: "binance", assetType: "crypto", enabled: true },
  { symbol: "BNB/BTC", exchange: "binance", assetType: "crypto", enabled: true },
  { symbol: "ADA/BTC", exchange: "binance", assetType: "crypto", enabled: true },
  { symbol: "DOGE/BTC", exchange: "binance", assetType: "crypto", enabled: true },
  { symbol: "AVAX/BTC", exchange: "binance", assetType: "crypto", enabled: true },
  { symbol: "DOT/BTC", exchange: "binance", assetType: "crypto", enabled: true },
  { symbol: "LINK/BTC", exchange: "binance", assetType: "crypto", enabled: true },
];
