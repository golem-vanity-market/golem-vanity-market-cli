import { appendFile } from "fs/promises";
import { GenerationPrefix } from "./params";
import { computePrefixDifficulty } from "./difficulty";
import { AppContext } from "./app_context";
import { ProofEntryResult } from "./estimator/proof";
import { writeFileSync } from "fs";

export interface ResultsServiceOptions {
  csvOutput: string | null; // File name for CSV output
  vanityPrefix: GenerationPrefix; // Optional vanity prefix
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
    if (entry.addr.startsWith(this.options.vanityPrefix.fullPrefix())) {
      this.savedAddr.push(entry);
      const addrDifficulty = computePrefixDifficulty(
        this.options.vanityPrefix.fullPrefix(),
      );
      onAddressFound(entry.jobId, entry.addr, addrDifficulty);
    }
    if (this.options.csvOutput) {
      const csvLine = `0,${entry.addr},${entry.salt},${entry.pubKey},${entry.provider.id},${entry.provider.name},${entry.provider.walletAddress}\n`;
      await appendFile(this.options.csvOutput, csvLine);
    }
  }
}
