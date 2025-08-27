import { ProviderInfo } from "@golem-sdk/golem-js";
import { Problem } from "../lib/db/schema";
export interface ProofEntryResult {
  addr: string;
  salt: string;
  pubKey: string;
  provider: ProviderInfo;
  jobId: string;
  workDone: number;
  matchingUserProblem: Problem | null;
}
