import * as otl from "@opentelemetry/api";
import { Logger } from "@golem-sdk/golem-js";
import { pinoLogger } from "@golem-sdk/pino-logger";
import { MetricsCollector } from "./metrics_collector";
import { LibSQLDatabase } from "drizzle-orm/libsql";

export class AppContext {
  private _activeContext: otl.Context;
  private logger?: Logger;
  private tracer?: otl.Tracer;
  private collector?: MetricsCollector;
  private db?: LibSQLDatabase;

  constructor(ctx: otl.Context) {
    this._activeContext = ctx;
  }

  public getDB(): LibSQLDatabase {
    if (!this.db) {
      throw new Error("DB is not set in the AppContext");
    }
    return this.db;
  }

  public WithLogger(logger: Logger): AppContext {
    const newCtx = new AppContext(this._activeContext);
    newCtx.logger = logger;
    newCtx.tracer = this.tracer;
    newCtx.collector = this.collector;
    newCtx.db = this.db;
    return newCtx;
  }

  public WithDatabase(db: LibSQLDatabase): AppContext {
    const newCtx = new AppContext(this._activeContext);
    newCtx.logger = this.logger;
    newCtx.tracer = this.tracer;
    newCtx.collector = this.collector;
    newCtx.db = db;
    return newCtx;
  }

  public WithTracer(tracer: otl.Tracer): AppContext {
    const newCtx = new AppContext(this._activeContext);
    newCtx.tracer = tracer;
    newCtx.logger = this.logger;
    newCtx.collector = this.collector;
    newCtx.db = this.db;
    return newCtx;
  }

  public WithCollector(collector: MetricsCollector): AppContext {
    const newCtx = new AppContext(this._activeContext);
    newCtx.collector = collector;
    newCtx.logger = this.logger;
    newCtx.tracer = this.tracer;
    newCtx.db = this.db;
    return newCtx;
  }

  public L(): Logger {
    if (!this.logger) {
      throw new Error("Logger is not set in the AppContext");
    }
    return this.logger;
  }

  public withValue<T>(key: string, value: T): AppContext {
    const otl_key = otl.createContextKey(key);
    const newOtlCtx = this._activeContext.setValue(otl_key, value);

    const newCtx = new AppContext(newOtlCtx);
    newCtx.logger = this.logger;
    newCtx.tracer = this.tracer;
    newCtx.collector = this.collector;
    newCtx.db = this.db;
    return newCtx;
  }

  public getValue<T>(key: string): T | undefined {
    const otl_key = otl.createContextKey(key);
    return this._activeContext.getValue(otl_key) as T | undefined;
  }

  public consoleInfo(message?: unknown, ...optionalParams: unknown[]): void {
    console.log(message, ...optionalParams);
  }

  public consoleError(message?: unknown, ...optionalParams: unknown[]): void {
    console.error(message, ...optionalParams);
  }
}

export function setJobId(ctx: AppContext, jobId: string): AppContext {
  return ctx.withValue("jobId", jobId);
}

export function getJobId(ctx: AppContext): string {
  const jobId = ctx.getValue<string>("jobId");
  if (!jobId) {
    throw new Error("Job ID not found in AppContext");
  }
  return jobId;
}

/**
 * Creates a Pino logger configured with OpenTelemetry transport
 *
 * Overwrite the default console log level (through pino-pretty) with GOLEM_PINO_LOG_LEVEL.
 *
 * @param appName - The application name to use for the logger
 * @returns Configured Pino logger with OpenTelemetry support
 */
export function getPinoLoggerWithOtel(
  appName: string,
  otelLoglevel: string,
): Logger {
  return pinoLogger({
    name: appName,
    transport: {
      targets: [
        {
          target: "pino-opentelemetry-transport",
          level: otelLoglevel,
          options: {
            severityNumberMap: {
              trace: 1,
              debug: 5,
              info: 9,
              warn: 13,
              error: 17,
              fatal: 21,
            },
          },
        },
        { target: "pino-pretty", options: { colorize: true }, level: "info" },
      ],
    },
  });
}
