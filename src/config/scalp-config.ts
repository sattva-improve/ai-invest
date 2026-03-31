import { env } from "./env.js";

export function getScalpConfig() {
  return {
    scalpEnabled: env.SCALP_ENABLED,
    scalpIntervalMinutes: env.SCALP_INTERVAL_MINUTES,
    scalpConfidenceThreshold: env.SCALP_CONFIDENCE_THRESHOLD,
    scalpModelId: env.SCALP_MODEL_ID,
    scalpMaxPairsPerCycle: env.SCALP_MAX_PAIRS_PER_CYCLE,
    scalpStoplossMonitorSeconds: env.SCALP_STOPLOSS_MONITOR_SECONDS,
    scalpAtrMultiplier: env.SCALP_ATR_MULTIPLIER,
  } as const;
}
