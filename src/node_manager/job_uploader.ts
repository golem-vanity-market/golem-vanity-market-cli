import type { ProofEntryResult } from "../estimator/proof";

export interface JobUploaderService {
  initJobIfNotInitialized(
    jobId: string,
    providerName: string,
    providerId: string,
    providerWalletAddress: string,
  ): Promise<void>;

  process(agreementId: string): Promise<void>;

  pushProofToQueue(result: ProofEntryResult): boolean;
}
