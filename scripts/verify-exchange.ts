/**
 * Binance API キー検証スクリプト（読み取り専用）
 * - 公開API: マーケットデータ取得（認証不要）
 * - 認証API: 残高取得（APIキー必要）
 * Usage: npx tsx scripts/verify-exchange.ts
 */
import ccxt from "ccxt";
import { config } from "dotenv";

config();

const exchangeId = process.env.EXCHANGE_ID ?? "binance";
const apiKey = process.env.EXCHANGE_API_KEY ?? "";
const secret = process.env.EXCHANGE_SECRET ?? "";

async function main() {
  console.log("=== Binance API Key Verification ===\n");
  console.log(`Exchange: ${exchangeId}`);
  console.log(`API Key: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)} (${apiKey.length} chars)`);
  console.log(`Secret:  ${secret.slice(0, 8)}...${secret.slice(-4)} (${secret.length} chars)\n`);

  // Step 1: 公開API テスト（認証不要）
  console.log("--- Step 1: Public API (no auth) ---");
  try {
    // biome-ignore lint/suspicious/noExplicitAny: ccxt dynamic exchange instantiation
    const ExchangeClass = (ccxt as any)[exchangeId];
    const publicExchange = new ExchangeClass({ enableRateLimit: true });
    const ticker = await publicExchange.fetchTicker("BTC/USDT");
    console.log(`✅ Public API OK — BTC/USDT price: $${ticker.last}`);
    console.log(`   Bid: $${ticker.bid}, Ask: $${ticker.ask}, Volume: ${ticker.baseVolume}\n`);
  } catch (err) {
    console.error(`❌ Public API FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // Step 2: OHLCV データ取得（認証不要）
  console.log("--- Step 2: OHLCV Data (no auth) ---");
  try {
    // biome-ignore lint/suspicious/noExplicitAny: ccxt dynamic exchange instantiation
    const ExchangeClass = (ccxt as any)[exchangeId];
    const publicExchange = new ExchangeClass({ enableRateLimit: true });
    const ohlcv = await publicExchange.fetchOHLCV("BTC/USDT", "1h", undefined, 5);
    console.log(`✅ OHLCV OK — ${ohlcv.length} candles fetched`);
    if (ohlcv.length > 0) {
      const latest = ohlcv[ohlcv.length - 1];
      console.log(
        `   Latest: Open=${latest[1]}, High=${latest[2]}, Low=${latest[3]}, Close=${latest[4]}, Volume=${latest[5]}\n`,
      );
    }
  } catch (err) {
    console.error(`❌ OHLCV FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // Step 3: 認証API テスト（残高取得 — 読み取りのみ）
  console.log("--- Step 3: Authenticated API (balance check) ---");
  if (!apiKey || !secret) {
    console.log("⚠️  SKIPPED — API Key or Secret is empty\n");
  } else {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: ccxt dynamic exchange instantiation
      const ExchangeClass = (ccxt as any)[exchangeId];
      const authExchange = new ExchangeClass({
        apiKey,
        secret,
        enableRateLimit: true,
        options: {
          recvWindow: 60000,
          adjustForTimeDifference: true,
        },
      });

      await authExchange.loadTimeDifference();
      const balance = await authExchange.fetchBalance();
      const nonZero = Object.entries(balance.total as Record<string, number>)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}: ${v}`);

      console.log("✅ Authenticated API OK — Balance fetched successfully");
      if (nonZero.length > 0) {
        console.log(`   Non-zero balances: ${nonZero.join(", ")}`);
      } else {
        console.log("   (No non-zero balances found)");
      }
      console.log("   API Key permissions are valid.\n");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ Authenticated API FAILED: ${message}`);
      if (message.includes("Invalid API-key")) {
        console.error("   → API Key が無効です。Binance の API Management で確認してください。");
      } else if (message.includes("Signature")) {
        console.error("   → Secret が正しくありません。再度コピーしてください。");
      } else if (message.includes("IP")) {
        console.error(
          "   → IP制限に引っかかっています。Binance で実行環境のIPを許可してください。",
        );
      } else if (message.includes("timestamp")) {
        console.error("   → サーバー時刻のズレです。NTP同期を確認してください。");
      }
      console.error();
    }
  }

  console.log("=== Verification Complete ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
