import type { Handler } from "aws-lambda";
import { env } from "../config/env.js";
import { RSS_FEEDS } from "../config/rss-feeds.js";
import { TRADING_PAIRS } from "../config/trading-pairs.js";
import { logger } from "../lib/logger.js";
import { getCryptoMarketData } from "../providers/crypto-market.js";
import { fetchRssFeeds } from "../providers/rss.js";
import { findByUrl, saveNewsItem } from "../repositories/news-repository.js";
import { type AppConfig, AppConfigSchema } from "../schemas/config.js";
import { analyzeNews } from "../services/ai-analyzer.js";

export interface AnalyzeHandlerResult {
  ticker: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  targetPrice?: number;
  riskLevel: string;
  timeHorizon: string;
  market: "JP" | "US" | "CN" | "CRYPTO";
  marketPrice?: number;
  positionSide: "LONG" | "SHORT";
  leverage: number;
}

/** 記事間の待機（API レート制限対策）*/
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determine market from ticker symbol.
 * - .T suffix → JP (Tokyo)
 * - .HK suffix → CN (via HKEX)
 * - .SS / .SZ suffix → CN (Shanghai/Shenzhen)
 * - Contains "/" → CRYPTO (e.g. ETH/BTC)
 * - Otherwise → US
 */
function detectMarket(ticker: string): "JP" | "US" | "CN" | "CRYPTO" {
  if (ticker.includes("/")) return "CRYPTO";
  if (ticker.endsWith(".T")) return "JP";
  if (ticker.endsWith(".HK") || ticker.endsWith(".SS") || ticker.endsWith(".SZ")) return "CN";
  return "US";
}

function isDailyTokenQuotaError(error: unknown): boolean {
  return String(error).toLowerCase().includes("too many tokens per day");
}

function isRetryExhaustedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { name?: string; reason?: string };
  return candidate.name === "AI_RetryError" || candidate.reason === "maxRetriesExceeded";
}

export async function analyzeHandler(config: AppConfig): Promise<AnalyzeHandlerResult> {
  const log = logger.child({ handler: "analyze" });
  log.info("Starting AI analysis cycle");

  const enabledFeeds = config.rssFeeds.filter((f) => f.enabled);
  const feedUrls = enabledFeeds.map((f) => f.url);

  const articles = await fetchRssFeeds({
    urls: feedUrls,
    maxItemsPerFeed: 10,
  });

  const MAX_ARTICLES_PER_CYCLE = 5;
  const INTER_ARTICLE_DELAY_MS = 5000;
  log.info({ count: articles.length }, "Articles fetched for analysis");

  let bestResult: AnalyzeHandlerResult | null = null;
  let attempted = 0;
  let analyzed = 0;

  for (const article of articles) {
    if (attempted >= MAX_ARTICLES_PER_CYCLE) {
      log.info({ limit: MAX_ARTICLES_PER_CYCLE }, "Reached per-cycle analysis limit");
      break;
    }

    try {
      // 冪等性チェック
      const existing = await findByUrl(article.url);
      if (existing) {
        log.debug({ url: article.url }, "Article already processed, skipping");
        continue;
      }

      // 記事間ディレイ
      if (analyzed > 0) {
        log.debug({ delayMs: INTER_ARTICLE_DELAY_MS }, "Waiting between articles");
        await sleep(INTER_ARTICLE_DELAY_MS);
      }

      attempted++;
      const decision = await analyzeNews({ article });
      analyzed++;

      await saveNewsItem(article, decision.confidence);

      const market = detectMarket(decision.ticker);

      // Keep the highest confidence result
      if (!bestResult || decision.confidence > bestResult.confidence) {
        let marketPrice: number | undefined;
        if (market === "CRYPTO") {
          try {
            const data = await getCryptoMarketData(decision.ticker);
            marketPrice = data?.price;
          } catch (err) {
            log.warn({ error: err, ticker: decision.ticker }, "Failed to fetch market price");
          }
        }

        bestResult = {
          ticker: decision.ticker,
          action: decision.action,
          confidence: decision.confidence,
          reasoning: decision.reasoning,
          targetPrice: decision.targetPrice,
          riskLevel: decision.riskLevel,
          timeHorizon: decision.timeHorizon,
          market,
          marketPrice,
          positionSide: decision.positionSide ?? "LONG",
          leverage: decision.leverage ?? 1,
        };
      }
    } catch (error) {
      log.error({ error, articleUrl: article.url }, "Failed to analyze article");
      if (isDailyTokenQuotaError(error) || isRetryExhaustedError(error)) {
        log.warn("GitHub Models API daily token quota exceeded — stopping this analysis cycle");
        break;
      }
    }
  }

  if (!bestResult) {
    log.info("No articles to analyze — returning HOLD with 0 confidence");
    return {
      ticker: "NONE",
      action: "HOLD",
      confidence: 0,
      reasoning: "No new articles found to analyze",
      riskLevel: "LOW",
      timeHorizon: "SHORT",
      market: "CRYPTO",
      positionSide: "LONG",
      leverage: 1,
    };
  }

  log.info(
    {
      ticker: bestResult.ticker,
      action: bestResult.action,
      confidence: bestResult.confidence,
      market: bestResult.market,
    },
    "Analysis cycle completed — best signal selected",
  );

  return bestResult;
}

// --- AWS Lambda entry point ---
const defaultConfig = AppConfigSchema.parse({
  rssFeeds: RSS_FEEDS,
  tradingPairs: TRADING_PAIRS,
});

export const handler: Handler = async () => {
  return analyzeHandler(defaultConfig);
};
