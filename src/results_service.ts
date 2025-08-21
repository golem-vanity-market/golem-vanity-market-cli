import { appendFile } from "fs/promises";
import { computePrefixDifficulty, computeSuffixDifficulty } from "./difficulty";
import { AppContext } from "./app_context";
import { ProofEntryResult } from "./estimator/proof";
import { writeFileSync } from "fs";
import { Problem } from "./lib/db/schema";

export interface ResultsServiceOptions {
  csvOutput: string | null; // File name for CSV output
  problems: Problem[];
}

export class ResultsService {
  private ctx;
  private options: ResultsServiceOptions;
  private savedAddr: ProofEntryResult[] = [];

  constructor(ctx: AppContext, opt: ResultsServiceOptions) {
    this.ctx = ctx;
    this.options = opt;
  }

  public get numberOfResults(): number {
    return this.savedAddr.length;
  }

  public async results(): Promise<ProofEntryResult[]> {
    return this.savedAddr;
  }

  public async saveResultsToFile(resultJsonPath: string): Promise<void> {
    const entries = await this.results();
    writeFileSync(resultJsonPath, JSON.stringify({ entries }, null, 2));
  }

  public async processValidatedEntry(
    entry: ProofEntryResult,
    onAddressFound: (
      jobId: string,
      address: string,
      addrDifficulty: number,
    ) => void,
  ): Promise<void> {
    const prefixProblem = this.options.problems.find(
      (p) => p.type === "user-prefix",
    );
    const suffixProblem = this.options.problems.find(
      (p) => p.type === "user-suffix",
    );
    if (
      prefixProblem &&
      entry.addr.toLowerCase().startsWith(prefixProblem.specifier.toLowerCase())
    ) {
      this.savedAddr.push(entry);
      const addrDifficulty = computePrefixDifficulty(prefixProblem.specifier);
      onAddressFound(entry.jobId, entry.addr, addrDifficulty);
    }
    if (
      suffixProblem &&
      entry.addr.toLowerCase().endsWith(suffixProblem.specifier.toLowerCase())
    ) {
      this.savedAddr.push(entry);
      const addrDifficulty = computeSuffixDifficulty(suffixProblem.specifier);
      onAddressFound(entry.jobId, entry.addr, addrDifficulty);
    }

    if (this.options.csvOutput) {
      const csvLine = `0,${entry.addr},${entry.salt},${entry.pubKey},${entry.provider.id},${entry.provider.name},${entry.provider.walletAddress}\n`;
      await appendFile(this.options.csvOutput, csvLine);
    }
  }
}
