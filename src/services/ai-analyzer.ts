import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { SpanStatusCode } from "@opentelemetry/api";
import { generateObject } from "ai";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { getTracer } from "../lib/tracer.js";
import { type InvestmentDecision, InvestmentDecisionSchema } from "../schemas/ai.js";
import type { MarketData } from "../schemas/market.js";
import type { NewsArticle } from "../schemas/news.js";

function getModel() {
  if (!env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is required for AI analysis");
  }
  const github = createOpenAICompatible({
    name: "github",
    baseURL: "https://models.github.ai/inference",
    apiKey: env.GITHUB_TOKEN,
  });
  return github(env.GITHUB_MODEL_ID);
}

export interface AnalyzeNewsOptions {
  article: NewsArticle;
  marketData?: MarketData;
}

function extractRetryAfterMs(err: unknown): number {
  if (err && typeof err === "object" && "data" in err) {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: dynamic error shape
      const data = (err as any).data as { error?: { details?: Array<{ retryDelay?: string }> } };
      const delay = data?.error?.details?.find((d) => d.retryDelay)?.retryDelay;
      if (delay) {
        const seconds = Number.parseFloat(delay.replace("s", ""));
        if (!Number.isNaN(seconds)) return Math.ceil(seconds * 1000) + 500;
      }
    } catch {
      // ignore parse errors
    }
  }
  return 30000;
}

function toSearchableText(value: unknown): string {
  const parts: string[] = [];

  const visit = (node: unknown, depth: number) => {
    if (depth > 5 || node == null) return;
    if (typeof node === "string") {
      parts.push(node);
      return;
    }
    if (typeof node === "number" || typeof node === "boolean") {
      parts.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node === "object") {
      for (const entry of Object.values(node)) {
        visit(entry, depth + 1);
      }
    }
  };

  visit(value, 0);
  return parts.join(" ").toLowerCase();
}

function isDailyTokenQuotaError(err: unknown): boolean {
  try {
    const serialized = JSON.stringify(err).toLowerCase();
    if (serialized.includes("too many tokens per day")) {
      return true;
    }
  } catch {}

  const text = toSearchableText(err);
  if (text.includes("too many tokens per day")) {
    return true;
  }

  const msg = String(err).toLowerCase();
  if (msg.includes("too many tokens per day")) {
    return true;
  }

  if (err && typeof err === "object" && "data" in err) {
    try {
      const data = (err as { data?: { message?: string } }).data;
      return String(data?.message ?? "")
        .toLowerCase()
        .includes("too many tokens per day");
    } catch {
      return false;
    }
  }

  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithRetry(
  modelFn: () => Promise<InvestmentDecision>,
  maxRetries = 0,
): Promise<InvestmentDecision> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await modelFn();
    } catch (err) {
      if (isDailyTokenQuotaError(err)) {
        throw err;
      }

      const is429 =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode: number }).statusCode === 429
          : String(err).includes("429") || String(err).includes("RESOURCE_EXHAUSTED");
      const isRetryError =
        err && typeof err === "object" && "reason" in err
          ? (err as { reason: string }).reason === "maxRetriesExceeded"
          : false;
      if ((is429 || isRetryError) && attempt < maxRetries) {
        // biome-ignore lint/suspicious/noExplicitAny: dynamic error shape
        const lastErr = isRetryError ? (err as any).lastError : err;
        const waitMs = extractRetryAfterMs(lastErr);
        logger.warn({ attempt, waitMs }, "Rate limited by GitHub Models API, waiting before retry");
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error("generateWithRetry: exhausted all retries");
}

export async function analyzeNews(options: AnalyzeNewsOptions): Promise<InvestmentDecision> {
  const tracer = getTracer();
  return tracer.startActiveSpan("ai.analyze", async (span) => {
    try {
      const { article, marketData } = options;
      const log = logger.child({ articleUrl: article.url });

      span.setAttribute("ai.model", env.GITHUB_MODEL_ID);
      span.setAttribute("ai.ticker", article.url);

      const prompt = buildPrompt(article, marketData);
      const result = await generateWithRetry(async () => {
        const { object } = await generateObject({
          model: getModel(),
          schema: InvestmentDecisionSchema,
          prompt,
          mode: "tool",
        });
        return object;
      });

      log.info(
        {
          ticker: result.ticker,
          action: result.action,
          confidence: result.confidence,
        },
        "News analysis completed",
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

export const __testables = {
  isDailyTokenQuotaError,
};

function buildPrompt(article: NewsArticle, marketData?: MarketData): string {
  const parts = [
    "You are an expert financial analyst. Analyze the following news article and provide an investment decision.",
    "",
    `Title: ${article.title}`,
    `Source: ${article.source}`,
    `Published: ${article.publishedAt}`,
  ];

  if (article.summary) parts.push(`Summary: ${article.summary}`);
  if (article.content) parts.push(`Content: ${article.content.slice(0, 2000)}`);

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
    "IMPORTANT: This system trades on Binance using SPOT trading.",
    "Supported quote currencies: JPY and BTC.",
    "",
    "Available JPY pairs: BTC/JPY, ETH/JPY, BNB/JPY",
    "Available BTC pairs: ETH/BTC, SOL/BTC, XRP/BTC, BNB/BTC, ADA/BTC, DOGE/BTC, AVAX/BTC, DOT/BTC, LINK/BTC",
    "",
    "Rules for ticker selection:",
    "- Choose the pair that best matches the news subject.",
    "- If the news is about Bitcoin itself, use BTC/JPY for direct exposure.",
    "- If the news is about an altcoin available as a JPY pair (ETH, BNB), prefer the JPY pair for simpler execution.",
    "- If the news is about an altcoin only available as a BTC pair (SOL, XRP, ADA, etc.), use the BTC pair.",
    "- Do NOT output USDT pairs. Do NOT output pairs not listed above.",
    "",
    "Position and leverage:",
    "- positionSide: Always LONG (spot trading only, no short selling)",
    "- leverage: Always 1 (spot trading, no leverage)",
    "",
    "Provide a structured investment decision with:",
    "- ticker: A trading pair from the lists above (e.g., BTC/JPY, ETH/BTC)",
    "- action: BUY, SELL, or HOLD",
    "- positionSide: LONG",
    "- leverage: 1",
    "- confidence: Your confidence level (0.0 to 1.0)",
    "- reasoning: Concise explanation of your decision",
    "- targetPrice: Optional price target in the quote currency (JPY or BTC)",
    "- riskLevel: LOW, MEDIUM, or HIGH",
    "- timeHorizon: SHORT (hours/days), MEDIUM (weeks), or LONG (months)",
  );

  return parts.join("\n");
}
