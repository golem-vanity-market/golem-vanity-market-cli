import { Estimator, formatEstimatorInfo } from "./estimator";

export function estimatorLuckHistogram(silent = false, printHist = true) {
  const simulatedDifficulty = 10000;

  const randomDifficultyCheck = (difficulty: number): boolean => {
    return Math.random() < 1 / difficulty;
  };

  const lucks = [];
  const total_runs = 1000; // Total number of runs to simulate
  for (let run_no = 0; run_no < total_runs; run_no++) {
    const est = new Estimator(simulatedDifficulty, "test");
    for (let attempts = 1; ; attempts += 1) {
      if (randomDifficultyCheck(simulatedDifficulty)) {
        const currentInfo = est.currentInfo();
        if (!silent) {
          //console.log("Success after " + attempts + " attempts:");
        }
        lucks.push(currentInfo.luckFactor * 100);
        break;
      }
      est.addProvedWork(1);
      const currentInfo = est.currentInfo();
      if (attempts % 1000 === 0) {
        if (!silent) {
          console.log(formatEstimatorInfo(currentInfo));
        }
      }
    }
  }
  if (!silent) {
    console.log("Luck factors:", lucks);
  }

  const average = lucks.reduce((a, b) => a + b, 0) / lucks.length;
  if (!silent) {
    console.log("Average luck factor:", average.toFixed(2));
  }

  // Median calculation
  const sorted = [...lucks].sort((a, b) => a - b);
  let median;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    median = (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    median = sorted[mid];
  }
  if (!silent) {
    console.log("Median luck factor:", median.toFixed(2));
  }

  const min = Math.min(...lucks);
  if (!silent) {
    console.log("Minimum luck factor:", min.toFixed(2));
  }

  const max = Math.max(...lucks);
  if (!silent) {
    console.log("Maximum luck factor:", max.toFixed(2));
  }

  const stdDev = Math.sqrt(
    lucks.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) /
      lucks.length,
  );
  if (!silent) {
    console.log("Standard deviation of luck factors:", stdDev.toFixed(2));
  }

  const binSize = 10; // e.g., 1.0 unit per bin
  const minLuck = Math.floor(Math.min(...lucks));
  const maxLuck = Math.min(Math.ceil(Math.max(...lucks)), 5000); // Cap at 5000 for histogram
  const numBins = Math.ceil((maxLuck - minLuck) / binSize);

  // Create bins
  const bins = Array(numBins).fill(0);
  lucks.forEach((value) => {
    const binIndex = Math.min(
      Math.floor((value - minLuck) / binSize),
      bins.length - 1,
    );
    bins[binIndex]++;
  });

  // Print histogram
  if (printHist) {
    console.log("\nLuck Histogram:");
    let aggr = 0;
    for (let i = 0; i < 30; i++) {
      const rangeStart = minLuck + i * binSize;
      const rangeEnd = rangeStart + binSize;
      const bar = (bins[i] / total_runs) * 100;
      aggr += bar;
      console.log(
        `${rangeStart.toFixed(1)}-${rangeEnd.toFixed(1)}%: ${bar.toFixed(2)}% 0-${rangeEnd.toFixed(1)}%: ${aggr.toFixed(2)}%`,
      );
    }
  }
  return {
    average: average,
    median: median,
    min: min,
    max: max,
  };
}
/*
const res = estimatorLuckHistogram(false);

console.log("Final Results:", res);

 */
