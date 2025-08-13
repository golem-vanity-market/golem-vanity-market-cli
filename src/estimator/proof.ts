import { ProviderInfo } from "@golem-sdk/golem-js";

export interface ProofEntryResult {
  addr: string;
  salt: string;
  pubKey: string;
  provider: ProviderInfo;
  jobId: string;
  workDone: number;
}
