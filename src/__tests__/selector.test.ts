import { OfferProposal } from "@golem-sdk/golem-js";
import { selectCheapestProvider } from "../node_manager/selector";

describe("Cheapest Proposal Selector", () => {
  it("should select the cheapest proposal", () => {
    const mockProposal1 = {
      getEstimatedCost: jest.fn(() => 100),
    } as unknown as OfferProposal;
    const mockProposal2 = {
      getEstimatedCost: jest.fn(() => 50),
    } as unknown as OfferProposal;
    const mockProposal3 = {
      getEstimatedCost: jest.fn(() => 75),
    } as unknown as OfferProposal;

    const proposals = [mockProposal1, mockProposal2, mockProposal3];
    const estimatedRentHours = 1;
    const selector = selectCheapestProvider(estimatedRentHours);
    expect(selector(proposals)).toBe(mockProposal2);
    expect(mockProposal1.getEstimatedCost).toHaveBeenCalledWith(
      estimatedRentHours,
    );
    expect(mockProposal2.getEstimatedCost).toHaveBeenCalledWith(
      estimatedRentHours,
    );
    expect(mockProposal3.getEstimatedCost).toHaveBeenCalledWith(
      estimatedRentHours,
    );
  });
});
