import type { ScheduledEvent, ScheduledHandler } from "aws-lambda";
import { env } from "../config/env.js";
import { RSS_FEEDS } from "../config/rss-feeds.js";
import { logger } from "../lib/logger.js";
import { fetchRssFeeds } from "../providers/rss.js";
import { findByUrl, saveNewsItem } from "../repositories/news-repository.js";
import { updateState } from "../repositories/state-repository.js";
import { type AppConfig, AppConfigSchema } from "../schemas/config.js";
import { analyzeNews } from "../services/ai-analyzer.js";

export interface FetchNewsHandlerResult {
	processed: number;
	skipped: number;
	analyzed: number;
	highConfidence: number;
}

export async function fetchNewsHandler(
	config: AppConfig,
): Promise<FetchNewsHandlerResult> {
	const log = logger.child({ handler: "fetch-news" });
	log.info("Starting news fetch cycle");

	const enabledFeeds = config.rssFeeds.filter((f) => f.enabled);
	const feedUrls = enabledFeeds.map((f) => f.url);

	const articles = await fetchRssFeeds({
		urls: feedUrls,
		maxItemsPerFeed: 10,
	});

	log.info({ count: articles.length }, "Articles fetched");

	let skipped = 0;
	let analyzed = 0;
	let highConfidence = 0;

	for (const article of articles) {
		try {
			// 冪等性チェック: 既に処理済みのURLはスキップ
			const existing = await findByUrl(article.url);
			if (existing) {
				log.debug({ url: article.url }, "Article already processed, skipping");
				skipped++;
				continue;
			}

			const decision = await analyzeNews({ article });
			analyzed++;

			// 分析結果をDBに保存
			await saveNewsItem(article, decision.confidence);

			if (decision.confidence > env.CONFIDENCE_THRESHOLD) {
				highConfidence++;
				log.info(
					{
						ticker: decision.ticker,
						action: decision.action,
						confidence: decision.confidence,
					},
					"High-confidence signal detected — trade execution pending (Phase 5)",
				);
			}
		} catch (error) {
			log.error(
				{ error, articleUrl: article.url },
				"Failed to process article",
			);
		}
	}

	// 最終実行時刻を更新
	await updateState(0); // Balance は Phase 5 の Trader で更新

	const result: FetchNewsHandlerResult = {
		processed: articles.length,
		skipped,
		analyzed,
		highConfidence,
	};

	log.info(result, "News fetch cycle completed");
	return result;
}

// --- AWS Lambda entry point ---
const defaultConfig = AppConfigSchema.parse({
  rssFeeds: RSS_FEEDS,
  tradingPairs: [
    { symbol: "BTC/USDT", assetType: "crypto", enabled: true },
    { symbol: "ETH/USDT", assetType: "crypto", enabled: true },
  ],
});

export const handler: ScheduledHandler = async (_event: ScheduledEvent) => {
  await fetchNewsHandler(defaultConfig);
};