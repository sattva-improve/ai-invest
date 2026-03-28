import { __testables } from "../ai-analyzer.js";

describe("isDailyTokenQuotaError", () => {
  it("returns true when error string contains daily quota message", () => {
    expect(
      __testables.isDailyTokenQuotaError(
        new Error("ThrottlingException: Too many tokens per day, please wait before trying again."),
      ),
    ).toBe(true);
  });

  it("returns true when nested data.message contains quota text", () => {
    expect(
      __testables.isDailyTokenQuotaError({
        data: { message: "Too many tokens per day, please wait before trying again." },
      }),
    ).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(__testables.isDailyTokenQuotaError(new Error("network timeout"))).toBe(false);
  });

  it("returns true for nested RetryError-style shape", () => {
    expect(
      __testables.isDailyTokenQuotaError({
        reason: "maxRetriesExceeded",
        lastError: {
          data: { message: "Too many tokens per day, please wait before trying again." },
        },
      }),
    ).toBe(true);
  });

  it("returns true when any child in errors[] has quota message", () => {
    expect(
      __testables.isDailyTokenQuotaError({
        errors: [
          new Error("temporary failure"),
          { data: { message: "Too many tokens per day, please wait before trying again." } },
        ],
      }),
    ).toBe(true);
  });

  it("returns true for deeply nested serialized error content", () => {
    expect(
      __testables.isDailyTokenQuotaError({
        outer: {
          inner: {
            message:
              "AI_RetryError maxRetriesExceeded: Too many tokens per day, please wait before trying again.",
          },
        },
      }),
    ).toBe(true);
  });
});
