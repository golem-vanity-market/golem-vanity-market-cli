import { ProviderInfo } from "@golem-sdk/golem-js";
import { ProcessingUnitType } from "../params";
import { AppContext } from "../app_context";
import { checkAddressProof } from "../pattern/pattern";
import { Problem } from "../lib/db/schema";

export type CommandStatus = "success" | "not_found" | "stopped";

export type VanityResult = {
  address: string;
  salt: string;
  pubKey: string;
  problem: Problem | null;
  workDone: number;
};

export type VanityResultMatchingProblem = VanityResult & {
  problem: Problem;
};

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

export interface ParsedResults {
  results: VanityResult[];
  failedLines: string[];
}

export function parseVanityResults(
  ctx: AppContext,
  lines: string[],
  problems: Problem[],
  processingUnit: ProcessingUnitType,
): ParsedResults {
  const results: VanityResult[] = [];
  const failedLines: string[] = [];

  for (let line of lines) {
    try {
      line = line.trim();
      if (line.startsWith("0x")) {
        const r = parseVanityResult(line, problems, processingUnit);
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
  //TODO reputation
  //add info about non matching lines
  return { results, failedLines };
}

export function parseVanityResult(
  line: string,
  problems: Problem[],
  processingUnit: ProcessingUnitType,
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

  const { passedProblem, workDone } = checkAddressProof(
    address,
    problems,
    processingUnit,
  );
  return {
    address,
    salt,
    pubKey,
    problem: passedProblem,
    workDone,
  };
}
