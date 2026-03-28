/**
 * Extended smoke test: 仮想通貨フォーカス — 記事数上限を増やしてAI分析の精度・安定性を検証
 * Usage: npx tsx scripts/smoke-test-extended.ts
 */
import { env } from "../src/config/env.js";
import { logger } from "../src/lib/logger.js";
import { getCryptoMarketData } from "../src/providers/crypto-market.js";
import { fetchRssFeeds } from "../src/providers/rss.js";
import { findByUrl, saveNewsItem } from "../src/repositories/news-repository.js";
import { AppConfigSchema } from "../src/schemas/config.js";
import { analyzeNews } from "../src/services/ai-analyzer.js";

const log = logger.child({ script: "smoke-test-extended" });

const MAX_ARTICLES = 20;
const INTER_ARTICLE_DELAY_MS = 3000;

const config = AppConfigSchema.parse({
  rssFeeds: [
    { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", enabled: true },
    { name: "Cointelegraph", url: "https://cointelegraph.com/rss", enabled: true },
    { name: "CryptoNews", url: "https://cryptonews.com/news/feed/", enabled: true },
    { name: "CryptoPotato", url: "https://cryptopotato.com/feed/", enabled: true },
  ],
  tradingPairs: [
    { symbol: "ETH/BTC", assetType: "crypto", enabled: true },
    { symbol: "SOL/BTC", assetType: "crypto", enabled: true },
    { symbol: "XRP/BTC", assetType: "crypto", enabled: true },
    { symbol: "BNB/BTC", assetType: "crypto", enabled: true },
  ],
  confidenceThreshold: 0.8,
  fetchIntervalMinutes: 60,
  priceIntervalMinutes: 5,
  maxOrderValueBtc: 0.001,
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface AnalysisResult {
  title: string;
  source: string;
  ticker: string;
  action: string;
  confidence: number;
  riskLevel: string;
  timeHorizon: string;
  reasoning: string;
  targetPrice?: number;
}

async function main() {
  log.info({ maxArticles: MAX_ARTICLES }, "=== Extended Smoke Test Start ===");

  // Step 1: マーケットデータ取得
  log.info("--- Step 1: Crypto Market Data ---");
  const pairs = ["ETH/BTC", "SOL/BTC", "XRP/BTC", "BNB/BTC"];
  for (const symbol of pairs) {
    const data = await getCryptoMarketData(symbol);
    if (data) {
      log.info(
        { symbol, price: data.price, rsi: data.rsi, volume: data.volume },
        "Market data fetched",
      );
    } else {
      log.warn({ symbol }, "Market data unavailable");
    }
  }

  // Step 2: RSS取得
  log.info("--- Step 2: RSS Fetch ---");
  const feedUrls = config.rssFeeds.filter((f) => f.enabled).map((f) => f.url);
  const articles = await fetchRssFeeds({ urls: feedUrls, maxItemsPerFeed: 10 });
  log.info({ totalArticles: articles.length }, "Articles fetched from all feeds");

  // Step 3: AI分析 (上限を拡大)
  log.info("--- Step 3: AI Analysis (expanded) ---");
  const results: AnalysisResult[] = [];
  let analyzed = 0;
  let skipped = 0;
  let errors = 0;

  for (const article of articles) {
    if (analyzed >= MAX_ARTICLES) {
      log.info({ limit: MAX_ARTICLES }, "Reached analysis limit");
      break;
    }

    try {
      const existing = await findByUrl(article.url);
      if (existing) {
        skipped++;
        continue;
      }

      if (analyzed > 0) {
        await sleep(INTER_ARTICLE_DELAY_MS);
      }

      const decision = await analyzeNews({ article });
      analyzed++;

      await saveNewsItem(article, decision.confidence);

      results.push({
        title: article.title.slice(0, 80),
        source: article.source,
        ticker: decision.ticker,
        action: decision.action,
        confidence: decision.confidence,
        riskLevel: decision.riskLevel,
        timeHorizon: decision.timeHorizon,
        reasoning: decision.reasoning.slice(0, 100),
        targetPrice: decision.targetPrice,
      });

      log.info(
        {
          n: analyzed,
          ticker: decision.ticker,
          action: decision.action,
          confidence: decision.confidence,
        },
        `Analyzed article ${analyzed}/${MAX_ARTICLES}`,
      );
    } catch (error) {
      errors++;
      log.error({ error, url: article.url }, "Analysis failed");
    }
  }

  // Step 4: 結果サマリ
  log.info("--- Step 4: Results Summary ---");
  const buys = results.filter((r) => r.action === "BUY");
  const sells = results.filter((r) => r.action === "SELL");
  const holds = results.filter((r) => r.action === "HOLD");
  const highConf = results.filter((r) => r.confidence > env.CONFIDENCE_THRESHOLD);

  console.log("\n========================================");
  console.log("  EXTENDED SMOKE TEST RESULTS");
  console.log("========================================\n");
  console.log(`Total articles fetched:  ${articles.length}`);
  console.log(`Analyzed:               ${analyzed}`);
  console.log(`Skipped (duplicate):    ${skipped}`);
  console.log(`Errors:                 ${errors}`);
  console.log("\n--- Signal Distribution ---");
  console.log(`BUY:   ${buys.length}`);
  console.log(`SELL:  ${sells.length}`);
  console.log(`HOLD:  ${holds.length}`);
  console.log(
    `\nHigh confidence (>${String(env.CONFIDENCE_THRESHOLD)}): ${String(highConf.length)}`,
  );

  if (highConf.length > 0) {
    console.log("\n--- High Confidence Signals ---");
    for (const r of highConf) {
      console.log(`  ${r.action} ${r.ticker} (conf: ${r.confidence}, risk: ${r.riskLevel})`);
      console.log(`    ${r.reasoning}`);
      if (r.targetPrice) console.log(`    Target: $${r.targetPrice}`);
    }
  }

  console.log("\n--- All Analysis Results ---");
  console.table(
    results.map((r) => ({
      Ticker: r.ticker,
      Action: r.action,
      Conf: r.confidence,
      Risk: r.riskLevel,
      Horizon: r.timeHorizon,
      Source: r.source,
      Title: r.title.slice(0, 50),
    })),
  );

  console.log("\n========================================");
  console.log("  TEST COMPLETE");
  console.log("========================================\n");

  process.exit(0);
}

main().catch((err) => {
  log.error({ err }, "Fatal error");
  process.exit(1);
});
