import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { getTracer } from "../lib/tracer.js";
import { SpanStatusCode } from "@opentelemetry/api";
import {
	InvestmentDecisionSchema,
	type InvestmentDecision,
} from "../schemas/ai.js";
import type { NewsArticle } from "../schemas/news.js";
import type { MarketData } from "../schemas/market.js";

const google = createGoogleGenerativeAI({
	apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
});

// Gemini 2.0 Flash — 高頻度・低コスト分析
const flashModel = google("gemini-2.0-flash-001");
// Gemini 2.5 Pro — 高精度分析（高確度案件に使用）
const proModel = google("gemini-2.5-pro-preview-05-06");

export interface AnalyzeNewsOptions {
	article: NewsArticle;
	marketData?: MarketData;
	useProModel?: boolean;
}

export async function analyzeNews(
	options: AnalyzeNewsOptions,
): Promise<InvestmentDecision> {
	const tracer = getTracer();
	return tracer.startActiveSpan("ai.analyze", async (span) => {
		try {
			const { article, marketData, useProModel = false } = options;
			const log = logger.child({ articleUrl: article.url });

			span.setAttribute("ai.model", "flash");
			span.setAttribute("ai.ticker", article.url);

			// First pass with Flash model
			const prompt = buildPrompt(article, marketData);
			const { object: firstResult } = await generateObject({
				model: flashModel,
				schema: InvestmentDecisionSchema,
				prompt,
			});

			// Upgrade to Pro if: confidence > 0.7 AND marketData is available
			if (firstResult.confidence > 0.7 && marketData != null && !useProModel) {
				span.setAttribute("ai.model", "pro");
				log.info(
					{ confidence: firstResult.confidence },
					"Upgrading to Pro model for high-confidence signal",
				);
				const { object: proResult } = await generateObject({
					model: proModel,
					schema: InvestmentDecisionSchema,
					prompt,
				});
				log.info(
					{
						ticker: proResult.ticker,
						action: proResult.action,
						confidence: proResult.confidence,
					},
					"Pro model analysis completed",
				);
				return proResult;
			}

			log.info(
				{
					ticker: firstResult.ticker,
					action: firstResult.action,
					confidence: firstResult.confidence,
				},
				"News analysis completed",
			);
			return firstResult;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			span.setStatus({ code: SpanStatusCode.ERROR, message });
			throw err;
		} finally {
			span.end();
		}
	});
}

function buildPrompt(article: NewsArticle, marketData?: MarketData): string {
	const parts = [
		"You are an expert financial analyst. Analyze the following news article and provide an investment decision.",
		"",
		`Title: ${article.title}`,
		`Source: ${article.source}`,
		`Published: ${article.publishedAt}`,
	];

	if (article.summary) parts.push(`Summary: ${article.summary}`);
	if (article.content)
		parts.push(`Content: ${article.content.slice(0, 2000)}`);

	if (marketData) {
		parts.push(
			"",
			"Current Market Data:",
			`  Symbol: ${marketData.symbol}`,
			`  Price: ${marketData.price}`,
			`  Volume: ${marketData.volume}`,
			`  RSI (14): ${marketData.rsi ?? "N/A"}`,
			`  As of: ${marketData.timestamp}`,
			`  Exchange: ${marketData.exchange ?? "unknown"}`,
		);
	}

	parts.push(
		"",
		"Provide a structured investment decision with:",
		"- ticker: The most relevant trading symbol (e.g., BTC/USDT for crypto, AAPL for stocks)",
		"- action: BUY, SELL, or HOLD",
		"- confidence: Your confidence level (0.0 to 1.0)",
		"- reasoning: Concise explanation of your decision",
		"- targetPrice: Optional price target",
		"- riskLevel: LOW, MEDIUM, or HIGH",
		"- timeHorizon: SHORT (hours/days), MEDIUM (weeks), or LONG (months)",
	);

	return parts.join("\n");
}
