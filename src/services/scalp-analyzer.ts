import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { SpanStatusCode } from "@opentelemetry/api";
import { generateObject } from "ai";
import { env } from "../config/env.js";
import { TRADING_PAIRS } from "../config/trading-pairs.js";
import { logger } from "../lib/logger.js";
import { getTracer } from "../lib/tracer.js";
import { getAllPositions } from "../repositories/position-repository.js";
import { type ScalpDecision, ScalpDecisionSchema } from "../schemas/scalp.js";

interface PromptPosition {
  ticker: string;
  amount: number;
  avgBuyPrice: number;
  currency: string;
}

function getScalpModel() {
  if (!env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is required for AI analysis");
  }
  const github = createOpenAICompatible({
    name: "github",
    baseURL: "https://models.github.ai/inference",
    apiKey: env.GITHUB_TOKEN,
  });
  return github(env.SCALP_MODEL_ID);
}

export interface AnalyzeScalpOptions {
  symbol: string;
  timeframes: Array<{
    timeframe: string;
    indicators: {
      rsi?: number;
      sma20?: number;
      sma50?: number;
      macd?: number;
      macdSignal?: number;
      macdHistogram?: number;
      bollingerUpper?: number;
      bollingerLower?: number;
      atr14?: number;
    };
    latestClose: number;
    latestVolume: number;
  }>;
  positions?: Array<{ ticker: string; amount: number; avgBuyPrice: number; currency: string }>;
  filterSignals?: string[];
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
  modelFn: () => Promise<ScalpDecision>,
  maxRetries = 0,
): Promise<ScalpDecision> {
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

export async function analyzeScalp(options: AnalyzeScalpOptions): Promise<ScalpDecision> {
  const tracer = getTracer();
  return tracer.startActiveSpan("scalp.analyze", async (span) => {
    try {
      const log = logger.child({ ticker: options.symbol, service: "scalp-analyzer" });

      span.setAttribute("ai.model", env.SCALP_MODEL_ID);
      span.setAttribute("ai.ticker", options.symbol);

      const positions =
        options.positions ??
        (await getAllPositions()).map((position) => ({
          ticker: position.Ticker,
          amount: position.Amount,
          avgBuyPrice: position.AvgBuyPrice,
          currency: position.Currency,
        }));

      const prompt = buildScalpPrompt(options, positions);
      const result = await generateWithRetry(async () => {
        const { object } = await generateObject({
          model: getScalpModel(),
          schema: ScalpDecisionSchema,
          prompt,
          mode: "tool",
        });
        return object;
      });

      const validTickers = new Set(
        TRADING_PAIRS.filter((pair) => pair.enabled).map((pair) => pair.symbol),
      );
      let finalResult: ScalpDecision = result;

      if (!validTickers.has(finalResult.ticker)) {
        logger.warn(
          { ticker: finalResult.ticker, action: finalResult.action },
          "AI returned unsupported ticker; forcing HOLD",
        );
        finalResult = { ...finalResult, action: "HOLD" };
      }

      if (finalResult.action === "BUY") {
        const tf5m = options.timeframes.find((tf) => tf.timeframe === "5m");
        const atr = tf5m?.indicators.atr14;
        const latestClose = tf5m?.latestClose;
        if (atr && atr > 0 && latestClose && latestClose > 0) {
          const distance = latestClose - finalResult.stopLossPrice;
          const tooTight = distance < 0.5 * atr;
          const tooLoose = distance > 3 * atr;
          const invalidDirection = finalResult.stopLossPrice >= latestClose;

          if (tooTight || tooLoose || invalidDirection) {
            const adjustedStopLossPrice = latestClose - atr * env.SCALP_ATR_MULTIPLIER;
            logger.warn(
              {
                ticker: finalResult.ticker,
                originalStopLossPrice: finalResult.stopLossPrice,
                adjustedStopLossPrice,
                latestClose,
                atr,
                atrMultiplier: env.SCALP_ATR_MULTIPLIER,
              },
              "Adjusted BUY stop-loss to ATR-based level",
            );
            finalResult = { ...finalResult, stopLossPrice: adjustedStopLossPrice };
          }
        }
      }

      log.info(
        {
          ticker: finalResult.ticker,
          action: finalResult.action,
          confidence: finalResult.confidence,
          stopLossPrice: finalResult.stopLossPrice,
          entryTimeframe: finalResult.entryTimeframe,
        },
        "Scalp analysis completed",
      );

      return finalResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      throw err;
    } finally {
      span.end();
    }
  });
}

function buildScalpPrompt(options: AnalyzeScalpOptions, positions: PromptPosition[]): string {
  const availablePairs = TRADING_PAIRS.filter((pair) => pair.enabled)
    .map((pair) => pair.symbol)
    .join(", ");
  const parts = [
    "You are a JPY-maximization crypto scalping advisor.",
    "Your PRIMARY OBJECTIVE is to maximize total JPY holdings through short-term scalping trades.",
    "Analyze ONLY the technical indicators across all timeframes provided below.",
    "",
    `Symbol under analysis: ${options.symbol}`,
    "",
    "Timeframe technical data:",
  ];

  for (const timeframeData of options.timeframes) {
    parts.push(
      `  Timeframe: ${timeframeData.timeframe}`,
      `  Latest Close: ${timeframeData.latestClose}`,
      `  Latest Volume: ${timeframeData.latestVolume}`,
      `  RSI: ${timeframeData.indicators.rsi ?? "N/A"}`,
      `  SMA-20: ${timeframeData.indicators.sma20 ?? "N/A"}`,
      `  SMA-50: ${timeframeData.indicators.sma50 ?? "N/A"}`,
      `  MACD: ${timeframeData.indicators.macd ?? "N/A"}`,
      `  MACD Signal: ${timeframeData.indicators.macdSignal ?? "N/A"}`,
      `  MACD Histogram: ${timeframeData.indicators.macdHistogram ?? "N/A"}`,
      `  Bollinger Upper: ${timeframeData.indicators.bollingerUpper ?? "N/A"}`,
      `  Bollinger Lower: ${timeframeData.indicators.bollingerLower ?? "N/A"}`,
      `  ATR(14): ${timeframeData.indicators.atr14 ?? "N/A"}`,
      "",
    );
  }

  parts.push("Current Portfolio:");
  if (positions.length === 0) {
    parts.push("  No open positions");
  } else {
    for (const position of positions) {
      parts.push(
        `  ${position.ticker}: ${position.amount} @ avg ${position.avgBuyPrice} ${position.currency}`,
      );
    }
  }

  parts.push("", `Available trading pairs: ${availablePairs}`);

  if (options.filterSignals && options.filterSignals.length > 0) {
    parts.push("", `Pre-filter signals detected: ${options.filterSignals.join(", ")}`);
  }

  parts.push(
    "",
    "Instructions:",
    "- Determine trend alignment across timeframes (higher timeframe = higher weight: 1d > 1h > 15m > 5m > 1m)",
    "- Set stopLossPrice using ATR-based levels. For BUY: stopLoss = entryPrice - (ATR × 2.0). You may override if you have a clearer signal.",
    "- For BUY: stopLossPrice MUST be BELOW current price",
    "- For SELL: this is an exit signal for an existing position",
    "- Only recommend BUY when multiple timeframes show aligned bullish signals",
    "- HOLD when signals conflict across timeframes",
    "- Do NOT output pairs not listed in the available pairs",
    "",
    "Confidence Calibration:",
    "- 0.9-1.0: Multiple timeframes aligned with strong RSI/MACD/Bollinger confluence",
    "- 0.8-0.9: Strong signal on primary timeframe, supporting signals on others",
    "- 0.6-0.8: Mixed signals or single moderate signal",
    "- Below 0.6: Conflicting timeframes (HOLD is appropriate)",
    "",
    "Provide a structured scalping decision with:",
    "- ticker: A trading pair from the available pairs list",
    "- action: BUY, SELL, or HOLD",
    "- confidence: Your confidence level (0.0 to 1.0)",
    "- reasoning: Concise technical explanation",
    "- stopLossPrice: Required stop-loss price",
    "- takeProfitPrice: Optional take-profit target",
    "- targetPrice: Optional target price",
    "- riskLevel: LOW, MEDIUM, or HIGH",
    "- entryTimeframe: One of 1m, 5m, 15m, 1h, 1d",
    "- trendAlignment: ALIGNED, CONFLICTING, or NEUTRAL",
  );

  return parts.join("\n");
}
