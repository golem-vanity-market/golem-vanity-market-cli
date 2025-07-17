import { ProviderInfo } from "@golem-sdk/golem-js";
import { ProcessingUnitType } from "../params";
import { AppContext } from "../app_context";

export type CommandStatus = "success" | "not_found" | "stopped";

export interface VanityResult {
  address: string;
  salt: string;
  pubKey: string;
  pattern: string;
  estimatedComplexity: number;
}

export interface IterationInfo {
  agreementId: string;
  provider: ProviderInfo;
  providerType: ProcessingUnitType;
  durationSeconds: number; // in seconds
  status: CommandStatus;
}

export interface CommandResult extends IterationInfo {
  results: VanityResult[];
  failedLines: string[];
}

interface ComplexityFunction {
  (pattern: string): number;
}

export interface ParsedResults {
  results: VanityResult[];
  failedLines: string[];
}

export function parseVanityResults(
  ctx: AppContext,
  lines: string[],
  pattern: string,
  complexFunc: ComplexityFunction,
): ParsedResults {
  const results: VanityResult[] = [];
  const failedLines: string[] = [];

  for (let line of lines) {
    try {
      line = line.trim();
      if (line.startsWith("0x")) {
        const r = ParseVanityResult(ctx, line, pattern, complexFunc);
        if (r == null) {
          ctx.L().warn(`Invalid vanity result line from provider:`, line);
          failedLines.push(line);
          continue;
        }
        results.push(r);
      }
    } catch (error) {
      console.error("Error parsing vanity result line:", line, error);
      failedLines.push(line);
      continue;
    }
  }
  return { results, failedLines };
}

export function ParseVanityResult(
  ctx: AppContext,
  line: string,
  keyPattern: string,
  complexFunc: ComplexityFunction,
): VanityResult | null {
  const trimmedLine = line.trim();
  if (!trimmedLine.startsWith("0x")) {
    return null;
  }

  const parts = trimmedLine.split(",");
  if (parts.length < 3) {
    return null;
  }

  const salt = parts[0].trim();
  const address = parts[1].trim();
  const pubKey = parts[2].trim();
  const pattern = keyPattern; // TODO recognize for which pattern this result is (results and proofs)

  return {
    address,
    salt,
    pubKey,
    pattern,
    estimatedComplexity: complexFunc(pattern),
  };
}
