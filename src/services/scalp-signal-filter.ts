import { logger } from "../lib/logger.js";

export interface FilteredPair {
  symbol: string;
  score: number;
  direction: "BUY" | "SELL";
  signals: string[];
}

interface PairData {
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
}

const ALIGNMENT_THRESHOLD = 3;
const EXPECTED_TIMEFRAMES = 5;

export function filterByTechnicalSignals(pairs: PairData[], maxPairs = 4): FilteredPair[] {
  const scoredPairs: FilteredPair[] = [];

  for (const pair of pairs) {
    let score = 0;
    let buySignalCount = 0;
    let sellSignalCount = 0;
    let bullishTimeframes = 0;
    let bearishTimeframes = 0;
    const signals: string[] = [];

    for (const timeframeData of pair.timeframes) {
      const { timeframe, indicators, latestClose } = timeframeData;
      let timeframeBullish = false;
      let timeframeBearish = false;

      if (typeof indicators.rsi === "number" && indicators.rsi < 30) {
        score += 2;
        buySignalCount += 1;
        timeframeBullish = true;
        signals.push(`RSI oversold on ${timeframe}`);
      }

      if (typeof indicators.rsi === "number" && indicators.rsi > 70) {
        score += 2;
        sellSignalCount += 1;
        timeframeBearish = true;
        signals.push(`RSI overbought on ${timeframe}`);
      }

      if (typeof indicators.macdHistogram === "number" && indicators.macdHistogram > 0) {
        score += 2;
        buySignalCount += 1;
        timeframeBullish = true;
        signals.push(`MACD bullish on ${timeframe}`);
      }

      if (typeof indicators.macdHistogram === "number" && indicators.macdHistogram < 0) {
        score += 2;
        sellSignalCount += 1;
        timeframeBearish = true;
        signals.push(`MACD bearish on ${timeframe}`);
      }

      if (
        typeof indicators.bollingerLower === "number" &&
        latestClose <= indicators.bollingerLower * 1.02
      ) {
        score += 1;
        buySignalCount += 1;
        timeframeBullish = true;
        signals.push(`Near Bollinger lower on ${timeframe}`);
      }

      if (
        typeof indicators.bollingerUpper === "number" &&
        latestClose >= indicators.bollingerUpper * 0.98
      ) {
        score += 1;
        sellSignalCount += 1;
        timeframeBearish = true;
        signals.push(`Near Bollinger upper on ${timeframe}`);
      }

      if (timeframeBullish) {
        bullishTimeframes += 1;
      }

      if (timeframeBearish) {
        bearishTimeframes += 1;
      }
    }

    if (bullishTimeframes >= ALIGNMENT_THRESHOLD || bearishTimeframes >= ALIGNMENT_THRESHOLD) {
      const alignmentDirection = bullishTimeframes >= bearishTimeframes ? "BUY" : "SELL";
      const alignmentCount = alignmentDirection === "BUY" ? bullishTimeframes : bearishTimeframes;
      score += 2;
      if (alignmentDirection === "BUY") {
        buySignalCount += 1;
      } else {
        sellSignalCount += 1;
      }
      signals.push(
        `Multi-TF aligned ${alignmentDirection} (${alignmentCount}/${EXPECTED_TIMEFRAMES})`,
      );
    }

    if (score > 0) {
      scoredPairs.push({
        symbol: pair.symbol,
        score,
        direction: buySignalCount >= sellSignalCount ? "BUY" : "SELL",
        signals,
      });
    }
  }

  const selectedPairs = scoredPairs.sort((a, b) => b.score - a.score).slice(0, maxPairs);

  logger.info(
    {
      inputPairs: pairs.length,
      scoredPairs: scoredPairs.length,
      selectedPairs: selectedPairs.map((pair) => ({
        symbol: pair.symbol,
        score: pair.score,
        direction: pair.direction,
      })),
    },
    "Technical signal filtering completed",
  );

  return selectedPairs;
}
