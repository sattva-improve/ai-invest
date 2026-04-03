import { describe, expect, it } from "vitest";
import { __testables } from "../scalp-analyzer.js";

describe("scalp isDailyTokenQuotaError", () => {
  it("returns true for GitHub Models daily rate limit metadata", () => {
    expect(
      __testables.isDailyTokenQuotaError({
        name: "AI_RetryError",
        errors: [
          {
            statusCode: 429,
            responseHeaders: {
              "x-ms-error-code": "RateLimitReached",
              "x-ratelimit-type": "UserByDay",
            },
          },
        ],
      }),
    ).toBe(true);
  });

  it("returns true for GitHub Models rate limit message text", () => {
    expect(
      __testables.isDailyTokenQuotaError({
        data: { message: "Rate limit reached for this model tier." },
      }),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(__testables.isDailyTokenQuotaError(new Error("socket hang up"))).toBe(false);
  });
});
