import { OfferProposal } from "@golem-sdk/golem-js";

export const selectBestProvider =
  (estimatedRentHours: number) =>
  (proposals: OfferProposal[]): OfferProposal => {
    if (proposals.length === 0) {
      throw new Error("No proposals available to select from.");
    }

    let bestProposal = proposals[0];
    for (const proposal of proposals) {
      const totalCost = proposal.getEstimatedCost(estimatedRentHours);
      if (totalCost < bestProposal.getEstimatedCost(estimatedRentHours)) {
        bestProposal = proposal;
      }
    }
    return bestProposal;
  };
