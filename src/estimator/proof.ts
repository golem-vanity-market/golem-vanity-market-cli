import { ProviderInfo } from "@golem-sdk/golem-js";
import { ProcessingUnitType } from "../params";

export interface ProofEntryResult {
  addr: string;
  salt: string;
  pubKey: string;
  provider: ProviderInfo;
  jobId: string;
  cpu: ProcessingUnitType;
}
