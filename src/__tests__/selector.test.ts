import type { OfferProposal } from "@golem-sdk/golem-js";
import { selectBestProvider } from "../node_manager/selector";
import { getCtxForTests } from "./utils";

describe("Cheapest Proposal Selector", () => {
  it("should select the cheapest proposal", () => {
    const getEstimatedCost1 = jest.fn(() => 100);
    const getEstimatedCost2 = jest.fn(() => 50);
    const getEstimatedCost3 = jest.fn(() => 75);

    const mockProposal1 = {
      getEstimatedCost: getEstimatedCost1,
    } as unknown as OfferProposal;
    const mockProposal2 = {
      getEstimatedCost: getEstimatedCost2,
    } as unknown as OfferProposal;
    const mockProposal3 = {
      getEstimatedCost: getEstimatedCost3,
    } as unknown as OfferProposal;

    const proposals = [mockProposal1, mockProposal2, mockProposal3];
    const estimatedRentHours = 1;
    const selector = selectBestProvider(
      getCtxForTests("selector-test"),
      estimatedRentHours,
    );
    expect(selector(proposals)).toBe(mockProposal2);
    expect(getEstimatedCost1).toHaveBeenCalledWith(estimatedRentHours);
    expect(getEstimatedCost2).toHaveBeenCalledWith(estimatedRentHours);
    expect(getEstimatedCost3).toHaveBeenCalledWith(estimatedRentHours);
  });
});
