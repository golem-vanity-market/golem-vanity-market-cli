import { Problem } from "../lib/db/schema";
import { VanityResult } from "../node_manager/result";

// export function getReputation(providerInfo: ProviderInfo): ReputationScore {
//     //TODO
//     //read from db info about complete agreements
//     //
// }

export function getExpectedPerformance() {
  //TODO
  //move logic from estimator
  //improve with precomputed expectations.
}

//TODO Reputation
//implement
export function calculateHashRate(
  _problems: Problem[],
  _vanityResults: VanityResult[],
): number {
  return 1;
}

export interface ReputationScore {
  isBanned: boolean;
  reputationScore: number;
}
