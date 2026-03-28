const mockStart = vi.fn();
const mockShutdown = vi.fn();

vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: class NodeSDK {
    start() {
      return mockStart();
    }
    shutdown() {
      return mockShutdown();
    }
  },
}));

vi.mock("@opentelemetry/auto-instrumentations-node", () => ({
  getNodeAutoInstrumentations: () => [],
}));

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: class OTLPTraceExporter {},
}));

vi.mock("../../config/env.js", () => ({
  env: {
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    GITHUB_COPILOT_TOKEN: "test-token",
  },
}));

import { getTracer, initTracer, shutdownTracer } from "../tracer.js";

describe("tracer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OTEL_ENABLED = undefined;
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = undefined;
  });

  it("initTracer does nothing when OTEL_ENABLED is not true", () => {
    initTracer("svc");
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("initTracer starts SDK when OTEL_ENABLED=true", () => {
    process.env.OTEL_ENABLED = "true";
    initTracer("svc");
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("shutdownTracer shuts down when initialized", async () => {
    process.env.OTEL_ENABLED = "true";
    initTracer("svc");
    await shutdownTracer();
    expect(mockShutdown).toHaveBeenCalledTimes(1);
  });

  it("getTracer returns a tracer instance", () => {
    const tracer = getTracer("name");
    expect(tracer).toBeDefined();
  });
});
