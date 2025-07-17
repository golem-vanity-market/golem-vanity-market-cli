// Import this file only once. Do not import any nontrivial code before it.
// Be very cautious about adding `import`s here.

import { createWriteStream } from "fs";
import { WriteStream } from "fs";
import path from "path";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import {
  PeriodicExportingMetricReader,
  InMemoryMetricExporter, // For testing
  PushMetricExporter,
  ResourceMetrics,
} from "@opentelemetry/sdk-metrics";
import {
  BatchLogRecordProcessor,
  LogRecordExporter,
  ReadableLogRecord,
  SimpleLogRecordProcessor,
  InMemoryLogRecordExporter, // For testing
} from "@opentelemetry/sdk-logs";
import { ExportResult, ExportResultCode } from "@opentelemetry/core";
import { APP_NAME, APP_VERSION } from "./version";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { resourceFromAttributes } from "@opentelemetry/resources";

// --- Custom Exporters with Asynchronous I/O ---
class FileMetricExporter implements PushMetricExporter {
  private filePath: string;
  private writer: WriteStream;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.writer = createWriteStream(this.filePath, { flags: "a" });
  }

  async export(metrics: ResourceMetrics): Promise<ExportResult> {
    try {
      const data = JSON.stringify(metrics) + "\n";
      // Write to the stream. This is a non-blocking operation.
      // We check the return value to handle backpressure if the stream is slow.
      if (!this.writer.write(data)) {
        // If the buffer is full, wait for it to drain before continuing.
        await new Promise<void>((resolve) =>
          this.writer.once("drain", resolve),
        );
      }
      return { code: ExportResultCode.SUCCESS };
    } catch (error) {
      console.error("Failed to export metrics to file:", error);
      return { code: ExportResultCode.FAILED, error: error as Error };
    }
  }

  async shutdown(): Promise<void> {
    return new Promise((resolve) => {
      this.writer.end(() => {
        console.log("FileMetricExporter stream closed.");
        resolve();
      });
    });
  }

  async forceFlush(): Promise<void> {
    // This exporter doesn't buffer, so flush is a no-op
    return Promise.resolve();
  }
}

class FileLogRecordExporter implements LogRecordExporter {
  private filePath: string;
  private writer: WriteStream;

  constructor(filePath: string) {
    this.filePath = filePath;
    // Use a writable stream for performance and to avoid blocking on large writes.
    this.writer = createWriteStream(this.filePath, { flags: "a" });
  }

  /**
   * Writes logs to the file stream sequentially instead of in one large batch.
   */
  async export(logs: ReadableLogRecord[]): Promise<ExportResult> {
    try {
      for (const log of logs) {
        const data = JSON.stringify(log) + "\n";
        // Write to the stream. This is a non-blocking operation.
        // We check the return value to handle backpressure if the stream is slow.
        if (!this.writer.write(data)) {
          // If the buffer is full, wait for it to drain before continuing.
          await new Promise<void>((resolve) =>
            this.writer.once("drain", resolve),
          );
        }
      }
      return { code: ExportResultCode.SUCCESS };
    } catch (error) {
      console.error("Failed to export logs to file:", error);
      return { code: ExportResultCode.FAILED, error: error as Error };
    }
  }

  /**
   * Ensure the stream is closed gracefully.
   */
  async shutdown(): Promise<void> {
    return new Promise((resolve) => {
      this.writer.end(() => {
        console.log("FileLogRecordExporter stream closed.");
        resolve();
      });
    });
  }
}

// --- Configuration ---

// Configuration file detection from environment variable
function detectConfigFile(): string | null {
  const envConfigFile = process.env.OTEL_CONFIG_FILE;
  if (envConfigFile) {
    const configPath = path.resolve(envConfigFile);
    // Use fs.statSync to check for file existence to avoid requiring 'fs' again
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      if (require("fs").statSync(configPath).isFile()) {
        console.log(
          `OpenTelemetry: Using config file from OTEL_CONFIG_FILE: ${envConfigFile}`,
        );
        return configPath;
      }
    } catch (_e) {
      console.warn(
        `OpenTelemetry: Config file specified in OTEL_CONFIG_FILE not found: ${envConfigFile}`,
      );
    }
  }
  return null;
}

// Create SDK configuration based on config file availability and environment
function createSDKConfig() {
  const configFile = detectConfigFile();
  // Standard way to detect test environment
  const isTestEnv = process.env.NODE_ENV === "test";

  if (configFile && !isTestEnv) {
    // Config file found and not in test env - let OTEL_CONFIG_FILE handle the rest
    process.env.OTEL_CONFIG_FILE = configFile;
    return {
      instrumentations: [getNodeAutoInstrumentations()],
    };
  }

  if (isTestEnv) {
    // In a test environment, use in-memory exporters to prevent file I/O and hangs.
    console.log(
      "OpenTelemetry: Using in-memory exporters for test environment.",
    );
    return {
      instrumentations: [getNodeAutoInstrumentations()],
      metricReader: new PeriodicExportingMetricReader({
        exporter: new InMemoryMetricExporter(0),
        exportIntervalMillis: 2, // Shorter interval for tests if needed
      }),
      logRecordProcessors: [
        new BatchLogRecordProcessor(new InMemoryLogRecordExporter()),
      ],
      shutdownTimeout: 5000,
    };
  }

  // Default programmatic configuration (for non-test env without a config file)
  console.log(
    "OpenTelemetry: No config file found, using programmatic file-based configuration.",
  );

  const logsDir = path.resolve("./logs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!require("fs").existsSync(logsDir)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("fs").mkdirSync(logsDir, { recursive: true });
  }

  const fileMetricExporter = new FileMetricExporter(
    path.join(logsDir, "metrics.jsonl"),
  );
  const fileLogExporter = new FileLogRecordExporter(
    path.join(logsDir, "logs.jsonl"),
  );

  return {
    instrumentations: [getNodeAutoInstrumentations()],
    metricReader: new PeriodicExportingMetricReader({
      exporter: fileMetricExporter,
      exportIntervalMillis: 2500,
      exportTimeoutMillis: 2000,
    }),
    logRecordProcessors: [new SimpleLogRecordProcessor(fileLogExporter)],
    shutdownTimeout: 8000,
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: APP_NAME,
      [ATTR_SERVICE_VERSION]: APP_VERSION,
    }),
  };
}

// --- Initialization ---

const sdk = new NodeSDK(createSDKConfig());

try {
  sdk.start();
  console.log("OpenTelemetry initialized successfully");
} catch (error) {
  console.error("OpenTelemetry initialization failed:", error);
  // Continue execution - telemetry failure should not break CLI functionality
}

// It makes sure that the collected data is flushed.
export function shutdownOpenTelemetry(): Promise<void> {
  if (sdk) {
    // Explicitly shutdown the metric reader to prevent hanging
    console.log("Shutting down OpenTelemetry SDK...");
    return sdk.shutdown();
  }
  return Promise.resolve();
}
