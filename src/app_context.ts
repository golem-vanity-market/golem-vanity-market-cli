import * as otl from "@opentelemetry/api";
import { type Logger } from "@golem-sdk/golem-js";
import { pinoLogger } from "@golem-sdk/pino-logger";
import { type MetricsCollector } from "./metrics_collector";
import { type LibSQLDatabase } from "drizzle-orm/libsql";

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

  public M(): MetricsCollector {
    if (!this.collector) {
      throw new Error("MetricsCollector is not set in the AppContext");
    }
    return this.collector;
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

  public debug(message: string): void {
    if (!this.logger) {
      throw new Error("Logger is not set in the AppContext");
    }
    const m = this.withPrefix(message);
    this.logger.debug(m, this.getTags());
  }

  public info(message: string): void {
    if (!this.logger) {
      throw new Error("Logger is not set in the AppContext");
    }
    const m = this.withPrefix(message);
    this.logger.info(m, this.getTags());
  }

  public warn(message: string): void {
    if (!this.logger) {
      throw new Error("Logger is not set in the AppContext");
    }
    const m = this.withPrefix(message);
    this.logger.warn(m, this.getTags());
  }

  public error(message: string): void {
    if (!this.logger) {
      throw new Error("Logger is not set in the AppContext");
    }
    const m = this.withPrefix(message);
    this.logger.error(m, this.getTags());
  }

  public consoleInfo(message?: unknown, ...optionalParams: unknown[]): void {
    console.log(message, ...optionalParams);
  }

  public consoleError(message?: unknown, ...optionalParams: unknown[]): void {
    console.error(message, ...optionalParams);
  }

  private withPrefix(m: string): string {
    const workerNo = this.getValue<number>("workerNo");
    const iterationNo = this.getValue<number>("iterationNo");
    let prefix = "";
    if (workerNo !== undefined) prefix = `Worker: ${workerNo}`;

    if (iterationNo !== undefined) {
      prefix = prefix + ` Iteration: ${iterationNo}`;
    }
    return prefix + " " + m;
  }

  public getTags(): Record<string, string> {
    const tags: Record<string, string> = {};
    const jobId = this.getValue<string>("jobId");
    if (jobId) {
      tags.jobId = jobId;
    }
    const workerNo = this.getValue<number>("workerNo");
    if (workerNo !== undefined) {
      tags.workerNo = workerNo.toString();
    }
    const iterationNo = this.getValue<number>("iterationNo");
    if (iterationNo !== undefined) {
      tags.iterationNo = iterationNo.toString();
    }
    return tags;
  }
}

export function withJobId(ctx: AppContext, jobId: string): AppContext {
  return ctx.withValue("jobId", jobId);
}

export function getJobId(ctx: AppContext): string {
  const jobId = ctx.getValue<string>("jobId");
  if (!jobId) {
    throw new Error("Job ID not found in AppContext");
  }
  return jobId;
}

export function withWorkerNo(ctx: AppContext, workerNo: number): AppContext {
  return ctx.withValue("workerNo", workerNo);
}

export function getWorkerNo(ctx: AppContext): number {
  const workerNo = ctx.getValue<number>("workerNo");
  if (workerNo === undefined) {
    throw new Error("Worker No not found in AppContext");
  }
  return workerNo;
}

export function setIterationNo(
  ctx: AppContext,
  iterationNo: number,
): AppContext {
  return ctx.withValue("iterationNo", iterationNo);
}

export function getIterationNo(ctx: AppContext): number {
  const iterationNo = ctx.getValue<number>("iterationNo");
  if (iterationNo === undefined) {
    throw new Error("Iteration No not found in AppContext");
  }
  return iterationNo;
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
