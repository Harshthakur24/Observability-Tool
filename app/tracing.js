'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-grpc');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');

const traceExporter = new OTLPTraceExporter({ url: "http://otel-collector:4317" });
const metricExporter = new OTLPMetricExporter({ url: "http://otel-collector:4317" });
const logExporter = new OTLPLogExporter({ url: "http://otel-collector:4317" });

const sdk = new NodeSDK({
  traceExporter,
  metricReader: new PeriodicExportingMetricReader({ exporter: metricExporter }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start()
  .then(() => console.log("✅ OpenTelemetry SDK started"))
  .catch(err => console.error("Error starting OpenTelemetry SDK", err));

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log("SDK shut down"))
    .catch(err => console.error(err))
    .finally(() => process.exit(0));
});
