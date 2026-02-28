import Parser from "rss-parser";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../lib/logger.js";
import { type NewsArticle, RssFeedItemSchema } from "../schemas/news.js";

const parser = new Parser({
	timeout: 10000,
	headers: {
		"User-Agent": "AlgoTradeBot/1.0 (RSS Reader)",
	},
});

export interface FetchRssOptions {
	urls: string[];
	maxItemsPerFeed?: number;
}

export async function fetchRssFeeds(
	options: FetchRssOptions,
): Promise<NewsArticle[]> {
	const { urls, maxItemsPerFeed = 20 } = options;
	const articles: NewsArticle[] = [];

	const results = await Promise.allSettled(
		urls.map((url) => fetchSingleFeed(url, maxItemsPerFeed)),
	);

	for (const result of results) {
		if (result.status === "fulfilled") {
			articles.push(...result.value);
		} else {
			logger.warn({ error: result.reason }, "Failed to fetch RSS feed");
		}
	}

	return articles;
}

async function fetchSingleFeed(
	url: string,
	maxItems: number,
): Promise<NewsArticle[]> {
	const log = logger.child({ feedUrl: url });
	log.debug("Fetching RSS feed");

	const feed = await parser.parseURL(url);
	const items = feed.items.slice(0, maxItems);

	const articles: NewsArticle[] = [];

	for (const item of items) {
		const parsed = RssFeedItemSchema.safeParse(item);
		if (!parsed.success) {
			log.warn({ item }, "Invalid RSS feed item, skipping");
			continue;
		}

		const publishedAt = parsed.data.isoDate ?? parsed.data.pubDate;
		if (!publishedAt) {
			log.debug({ title: parsed.data.title }, "No publish date, skipping");
			continue;
		}

		articles.push({
			id: uuidv4(),
			title: parsed.data.title ?? "Untitled",
			url: parsed.data.link ?? url,
			publishedAt,
			source: feed.title ?? new URL(url).hostname,
			summary: parsed.data.contentSnippet,
			content: parsed.data.content,
		});
	}

	log.info({ count: articles.length }, "RSS feed fetched");
	return articles;
}
