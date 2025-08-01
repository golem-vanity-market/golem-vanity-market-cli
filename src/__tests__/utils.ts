import { AppContext, getPinoLoggerWithOtel } from "../app_context";
import { ROOT_CONTEXT } from "@opentelemetry/api";

export function getCtxForTests(testName: string): AppContext {
  const logger = getPinoLoggerWithOtel(testName, "info");
  const ctx: AppContext = new AppContext(ROOT_CONTEXT).WithLogger(logger);
  return ctx;
}
