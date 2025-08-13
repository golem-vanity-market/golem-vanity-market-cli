import { Estimator, SpeedEstimation } from "../estimator/estimator";

describe("SpeedEstimation", () => {
  const startTime = new Date("2023-01-01T00:00:00Z");
  const endTime = new Date("2023-01-01T00:00:10Z"); // 10 seconds later

  it("should calculate speed correctly", () => {
    const estimation = new SpeedEstimation(
      endTime,
      startTime,
      100_000, // currentAttempts
      0, // startAttempts
    );
    // 100,000 attempts in 10 seconds = 10,000 attempts/sec
    expect(estimation.speed).toBe(10_000);
  });

  it("should calculate cost per hour correctly", () => {
    const estimation = new SpeedEstimation(
      endTime,
      startTime,
      100_000,
      0,
      0.05, // currentCost
      0.01, // startCost
    );
    // Cost diff = 0.04. Time diff = 10s = 10/3600 hours.
    // Cost per hour = 0.04 / (10 / 3600) = 0.04 * 360 = 14.4
    expect(estimation.costPerHour).toBeCloseTo(14.4);
  });

  it("should return 0 for speed and cost if time difference is zero or negative", () => {
    const estimation = new SpeedEstimation(
      startTime,
      startTime,
      100_000,
      0,
      0.05,
      0.01,
    );
    expect(estimation.speed).toBe(0);
    expect(estimation.costPerHour).toBe(0);
  });
});

describe("Estimator", () => {
  const TARGET_DIFFICULTY = 1_000_000;
  let estimator: Estimator;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2000-01-01T00:00:00.000Z"));
    estimator = new Estimator(TARGET_DIFFICULTY, "test-provider", "test-id");
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("addProvedWork", () => {
    it("should reset currentAttempts but accumulate totalAttempts on success", () => {
      estimator.addProvedWork(500_000);
      expect(estimator.currentAttempts).toBe(500_000);
      expect(estimator.totalAttempts).toBe(500_000);
      expect(estimator.totalSuccesses).toBe(0);

      estimator.addProvedWork(100_000, true);

      expect(estimator.currentAttempts).toBe(0); // Reset on success
      expect(estimator.totalAttempts).toBe(600_000); // Accumulates total
      expect(estimator.totalSuccesses).toBe(1); // Incremented
    });
  });

  describe("Speed and Time Estimation", () => {
    it("should calculate speed correctly after a single interval", () => {
      jest.advanceTimersByTime(10 * 1000); // 10 seconds
      estimator.addProvedWork(100_000);

      const speedInfo = estimator.estimatedSpeed(60);
      // Expected speed = attempts / time = 100,000 / 10s = 10,000 attempts/s
      expect(speedInfo.speed).toBeCloseTo(10_000);
    });

    it("should calculate average speed over a specified time window", () => {
      // 0s: start (0 attempts)
      jest.advanceTimersByTime(10 * 1000); // t=10s
      estimator.addProvedWork(100_000); // total: 100k

      jest.advanceTimersByTime(10 * 1000); // t=20s
      estimator.addProvedWork(100_000); // total: 200k

      jest.advanceTimersByTime(10 * 1000); // t=30s
      estimator.addProvedWork(300_000); // total: 500k

      // Speed over the last 15 seconds from the latest entry (at t=30s).
      // _getOldestRecentEntry(15) will find the entry at t=20s.
      const speedInfo = estimator.estimatedSpeed(15);

      // (TotalAttemptsAt30s - TotalAttemptsAt20s) / (TimeAt30s - TimeAt20s)
      // (500_000 - 200_000) / 10s = 30,000 attempts/s
      expect(speedInfo.speed).toBeCloseTo(30_000);
    });

    it("should estimate remaining time correctly", () => {
      // 20,000 attempts/s
      jest.advanceTimersByTime(10 * 1000);
      estimator.addProvedWork(200_000);

      // Expected ETA = 1,000,000 / 20,000 = 50 seconds.
      const eta = estimator.estimateTime();
      expect(eta).toBeCloseTo(50);
    });
  });

  describe("Probability and Luck Factor", () => {
    it("should estimate attempts for a given probability", () => {
      const prob = 0.5;
      const expectedAttempts =
        Math.log(1 - prob) / Math.log(1 - 1 / TARGET_DIFFICULTY);
      expect(estimator.estimateAttemptsGivenProbability(prob)).toBeCloseTo(
        expectedAttempts,
      );
      // For 50% chance, attempts should be close to N * ln(2)
      expect(estimator.estimateAttemptsGivenProbability(0.5)).toBeCloseTo(
        TARGET_DIFFICULTY * Math.LN2,
        0, // compare whole numbers
      );
    });

    it("should calculate luck factor", () => {
      // Luck factor is high for low probability events
      const prob = estimator.estimateProbability(1);
      expect(estimator.luckFactor(1)).toBeCloseTo(1 / prob - 1);

      // Luck factor approaches 0 as probability approaches 1
      const attemptsFor99percent =
        estimator.estimateAttemptsGivenProbability(0.99);
      expect(estimator.luckFactor(attemptsFor99percent)).toBeCloseTo(
        1 / 0.99 - 1,
      );
    });
  });

  describe("currentInfo", () => {
    it("should gather and return all information correctly", () => {
      jest.advanceTimersByTime(10 * 1000);
      estimator.setCurrentCost(0.1);
      estimator.addProvedWork(200_000);

      const info = estimator.currentInfo();

      expect(info.attempts).toBe(200_000);
      expect(info.providerName).toBe("test-provider");
      expect(info.cost).toBe(0.1);
      expect(info.probabilityFactor).toBe(
        estimator.estimateProbability(200_000),
      );
      expect(info.luckFactor).toBe(estimator.luckFactor(200_000));
      expect(info.remainingTimeSec).toBeCloseTo(50); // 1M / (200k/10s)
      expect(info.estimatedSpeed?.speed).toBeCloseTo(20_000);
      // Total efficiency = total attempts / total cost / 1e12
      // 200_000 / 0.1 / 1e12 = 2e6 / 1e12 = 2e-6
      expect(info.totalEfficiency).toBeCloseTo(2e-6);
    });
  });
});
