import type { OfferProposal } from "@golem-sdk/golem-js";
import type { AppContext } from "../app_context";
import type { Reputation } from "./types";

export const proposalPool = new Map<string, OfferProposal>();
export const scriptStartTime = Date.now();

function getDemandExpirationDate(proposal: OfferProposal): Date | null {
  const demandExpirationProperty =
    proposal.demand.details.prototype.properties.find(
      (el) => el.key === "golem.srv.comp.expiration",
    );
  if (demandExpirationProperty) {
    try {
      const exp = parseInt(demandExpirationProperty.value.toString());
      return new Date(exp); // Convert seconds to milliseconds
    } catch (error) {
      console.warn(
        "Error parsing expiration value for proposal:",
        proposal.id,
        error,
      );
    }
  }
  return null;
}

export function getProposalPoolJson() {
  return Array.from(proposalPool.values()).map((proposal) => {
    return {
      id: proposal.id,
      providerId: proposal.provider.id,
      estimatedCost: proposal.getEstimatedCost(1),
      proposalTime: proposal.timestamp.toISOString(),
      demandExpiration: getDemandExpirationDate(proposal)?.toISOString(),
      offer: proposal.properties,
      pricing: proposal.pricing,
    };
  });
}

export const filterProposal =
  (ctx: AppContext, bannedProviders: Reputation) =>
  (proposal: OfferProposal) => {
    if (proposal.id == "golem") {
      return true;
    }
    const MINIMUM_CPU_CORES = parseInt(process.env.MINIMUM_CPU_CORES || "1");
    if (proposal.properties["golem.inf.cpu.threads"] < MINIMUM_CPU_CORES) {
      /*ctx.info(
      "Proposal has less than 32 CPU threads, skipping: ",
      proposal.id,
    );*/
      return false;
    }
    if (bannedProviders.isProviderBanned(proposal.provider.id)) {
      ctx.consoleInfo("Skipping banned provider: ", proposal.provider.id);
      return false;
    }
    //ctx.info("Proposal has enough cores (32 or more) CPU");

    proposalPool.set(proposal.provider.id, proposal);
    // If the proposal is not from Golem, we can filter it out
    return true;
  };

export const selectBestProvider =
  (ctx: AppContext, estimatedRentHours: number) =>
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
    ctx.consoleInfo("Best proposal selected:", bestProposal.id);
    return bestProposal;
  };
