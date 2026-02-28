import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { trace, type Tracer } from "@opentelemetry/api";
import { logger } from "./logger.js";

let sdk: NodeSDK | null = null;

export function initTracer(serviceName = "algo-trade-bot"): void {
	if (process.env.OTEL_ENABLED !== "true") {
		logger.info("OpenTelemetry disabled (OTEL_ENABLED != true)");
		return;
	}

	const exporter = new OTLPTraceExporter({
		url:
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
			"http://localhost:4318/v1/traces",
	});

	sdk = new NodeSDK({
		serviceName,
		traceExporter: exporter,
		instrumentations: [getNodeAutoInstrumentations()],
	});

	sdk.start();
	logger.info({ serviceName }, "OpenTelemetry initialized");
}

export async function shutdownTracer(): Promise<void> {
	if (sdk) {
		await sdk.shutdown();
		logger.info("OpenTelemetry shutdown complete");
	}
}

export function getTracer(name = "algo-trade-bot"): Tracer {
	return trace.getTracer(name);
}
