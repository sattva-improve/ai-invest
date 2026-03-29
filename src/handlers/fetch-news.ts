import type { ScheduledEvent, ScheduledHandler } from "aws-lambda";
import { env } from "../config/env.js";
import { RSS_FEEDS } from "../config/rss-feeds.js";
import { TRADING_PAIRS } from "../config/trading-pairs.js";
import { logger } from "../lib/logger.js";
import { getCryptoMarketData } from "../providers/crypto-market.js";
import { fetchRssFeeds } from "../providers/rss.js";
import { getStockMarketData } from "../providers/stock-market.js";
import { findByUrl, saveNewsItem } from "../repositories/news-repository.js";
import { updateState } from "../repositories/state-repository.js";
import { type AppConfig, AppConfigSchema } from "../schemas/config.js";
import { analyzeNews } from "../services/ai-analyzer.js";
import { executeTradeHandler } from "./execute-trade.js";

export interface FetchNewsHandlerResult {
  processed: number;
  skipped: number;
  analyzed: number;
  highConfidence: number;
  /** 今回未処理の記事数（次回の呼び出しで処理される） */
  remaining: number;
}

/** 記事間の待機（API レート制限対策）*/
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const LOW_QUALITY_PATTERNS = [
  /sponsored/i,
  /advertisement/i,
  /\bad\b/i,
  /opinion:/i,
  /editorial:/i,
  /column:/i,
  /recap:/i,
  /weekly\s+roundup/i,
  /daily\s+roundup/i,
  /weekly\s+recap/i,
  /daily\s+recap/i,
  /top\s+\d+\s+(stories|articles|news)/i,
  /press\s+release/i,
  /\bPR\b:/,
];

function isLowQualityArticle(title: string): boolean {
  return LOW_QUALITY_PATTERNS.some((pattern) => pattern.test(title));
}

export async function fetchNewsHandler(config: AppConfig): Promise<FetchNewsHandlerResult> {
  const log = logger.child({ handler: "fetch-news" });
  log.info("Starting news fetch cycle");

  const enabledFeeds = config.rssFeeds.filter((f) => f.enabled);
  const feedUrls = enabledFeeds.map((f) => f.url);

  const articles = await fetchRssFeeds({
    urls: feedUrls,
    maxItemsPerFeed: 10,
  });

  // 1サイクルあたりの最大分析件数（Lambda 60sタイムアウト対策、env設定可能）
  const maxArticles = env.MAX_ARTICLES_PER_CYCLE;
  // 記事間の待機時間（ms）: Copilot API制限対策
  const INTER_ARTICLE_DELAY_MS = 2000;
  log.info({ count: articles.length }, "Articles fetched");

  let skipped = 0;
  let analyzed = 0;
  let highConfidence = 0;

  for (const article of articles) {
    if (analyzed >= maxArticles) {
      log.info({ limit: maxArticles }, "Reached per-cycle analysis limit, stopping");
      break;
    }
    try {
      // 冪等性チェック: 既に処理済みのURLはスキップ
      const existing = await findByUrl(article.url);
      if (existing) {
        log.debug({ url: article.url }, "Article already processed, skipping");
        skipped++;
        continue;
      }

      if (isLowQualityArticle(article.title)) {
        log.debug({ title: article.title }, "Low-quality article filtered out");
        skipped++;
        continue;
      }

      // 記事間ディレイ（2件目以降、テスト環境では省略）
      if (analyzed > 0 && env.NODE_ENV !== "test") {
        log.debug({ delayMs: INTER_ARTICLE_DELAY_MS }, "Waiting between articles");
        await sleep(INTER_ARTICLE_DELAY_MS);
      }

      const decision = await analyzeNews({ article });
      analyzed++;

      await saveNewsItem(article, decision.confidence);

      if (decision.confidence >= env.CONFIDENCE_THRESHOLD) {
        highConfidence++;
        const isCrypto = config.tradingPairs.some(
          (p) => p.assetType === "crypto" && p.symbol === decision.ticker,
        );
        const marketData = isCrypto
          ? await getCryptoMarketData(decision.ticker)
          : await getStockMarketData(decision.ticker);

        if (!marketData) {
          log.warn(
            {
              ticker: decision.ticker,
              confidence: decision.confidence,
              hasTargetPrice: decision.targetPrice != null,
            },
            "Market data unavailable — trade will use targetPrice as fallback",
          );
        }

        log.info(
          {
            ticker: decision.ticker,
            action: decision.action,
            confidence: decision.confidence,
            marketPrice: marketData?.price,
          },
          "High-confidence signal detected — executing trade",
        );
        await executeTradeHandler(decision, config, marketData?.price);
      }
    } catch (error) {
      log.error({ error, articleUrl: article.url }, "Failed to process article");
    }
  }

  await updateState(0);

  const remaining = articles.length - skipped - analyzed;
  const result: FetchNewsHandlerResult = {
    processed: articles.length,
    skipped,
    analyzed,
    highConfidence,
    remaining: Math.max(0, remaining),
  };

  log.info(result, "News fetch cycle completed");
  return result;
}

// --- AWS Lambda entry point ---
const defaultConfig = AppConfigSchema.parse({
  rssFeeds: RSS_FEEDS,
  tradingPairs: TRADING_PAIRS,
  confidenceThreshold: env.CONFIDENCE_THRESHOLD,
  maxOrderValueBtc: env.MAX_ORDER_VALUE_BTC,
  maxOrderValueJpy: env.MAX_ORDER_VALUE_JPY,
  maxLeverage: env.MAX_LEVERAGE,
  marginMode: env.MARGIN_MODE,
  enableShortSelling: env.ENABLE_SHORT_SELLING,
});

export const handler: ScheduledHandler = async (_event: ScheduledEvent) => {
  await fetchNewsHandler(defaultConfig);
};
