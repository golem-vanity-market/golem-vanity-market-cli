import { estimatorLuckHistogram } from "../estimator/estimator-luck-histogram";

describe("Estimator - check probabilities", () => {
  it("Check if median in multiple search is around 100%", () => {
    const res = estimatorLuckHistogram(true, false);
    console.log("Res:", res);
    expect(res.median > 80.0).toBeTruthy();
    expect(res.median < 120.0).toBeTruthy();
    expect(res.average > 400.0).toBeTruthy();
    expect(res.min < 1.0).toBeTruthy();
    expect(res.max > 10000.0).toBeTruthy();
  });
});
