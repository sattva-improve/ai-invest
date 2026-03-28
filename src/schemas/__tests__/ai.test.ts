import { InvestmentDecisionSchema } from "../ai.js";

describe("InvestmentDecisionSchema", () => {
  it("parses a valid BUY decision correctly", () => {
    const input = {
      ticker: "ETH/BTC",
      action: "BUY",
      confidence: 0.85,
      reasoning: "Strong bullish momentum",
    };

    const result = InvestmentDecisionSchema.parse(input);

    expect(result.ticker).toBe("ETH/BTC");
    expect(result.action).toBe("BUY");
    expect(result.confidence).toBe(0.85);
    expect(result.reasoning).toBe("Strong bullish momentum");
    expect(result.riskLevel).toBe("MEDIUM"); // default
    expect(result.timeHorizon).toBe("SHORT"); // default
  });

  it("parses a valid SELL with optional targetPrice", () => {
    const input = {
      ticker: "AAPL",
      action: "SELL",
      confidence: 0.72,
      reasoning: "Bearish divergence detected",
      targetPrice: 150.5,
      riskLevel: "HIGH",
      timeHorizon: "MEDIUM",
    };

    const result = InvestmentDecisionSchema.parse(input);

    expect(result.targetPrice).toBe(150.5);
    expect(result.riskLevel).toBe("HIGH");
    expect(result.timeHorizon).toBe("MEDIUM");
  });

  it("fails when action is not BUY/SELL/HOLD", () => {
    const input = {
      ticker: "ETH/BTC",
      action: "SHORT",
      confidence: 0.5,
      reasoning: "test",
    };

    const result = InvestmentDecisionSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it("fails when confidence is greater than 1", () => {
    const input = {
      ticker: "ETH/BTC",
      action: "BUY",
      confidence: 1.5,
      reasoning: "test",
    };

    const result = InvestmentDecisionSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it("fails when confidence is less than 0", () => {
    const input = {
      ticker: "ETH/BTC",
      action: "BUY",
      confidence: -0.1,
      reasoning: "test",
    };

    const result = InvestmentDecisionSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it("applies default riskLevel and timeHorizon", () => {
    const input = {
      ticker: "ETH/BTC",
      action: "HOLD",
      confidence: 0.3,
      reasoning: "Neutral outlook",
    };

    const result = InvestmentDecisionSchema.parse(input);

    expect(result.riskLevel).toBe("MEDIUM");
    expect(result.timeHorizon).toBe("SHORT");
  });

  it("allows omitting targetPrice", () => {
    const input = {
      ticker: "ETH/BTC",
      action: "BUY",
      confidence: 0.9,
      reasoning: "Moon",
    };

    const result = InvestmentDecisionSchema.parse(input);

    expect(result.targetPrice).toBeUndefined();
  });
});
