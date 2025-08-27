import { Estimator } from "./estimator";
// @ts-expect-error This is library import
import cliProgress from "cli-progress";
import { sleep } from "@golem-sdk/golem-js";
import { displayDifficulty, displayTime } from "../utils/format";
const simulatedDifficulty = 300000000;
const scalingFactor = 1000000; // Scale down the difficulty for the progress bar

function randomDifficultyCheck(difficulty: number): boolean {
  return Math.random() < 1 / difficulty;
}

async function run() {
  const est = new Estimator(simulatedDifficulty, "test", "test-provider");

  est.addProvedWork(1);

  // @ts-expect-error This is library callback
  function formatter(_options, _params, _payload) {
    // bar grows dynamically by current progress - no whitespaces are added
    const commonInfo = est.currentInfo();
    const unfortunateIteration = Math.floor(
      commonInfo.attempts / est.estimateAttemptsGivenProbability(0.5),
    );
    const partial =
      commonInfo.attempts / est.estimateAttemptsGivenProbability(0.5) -
      unfortunateIteration;
    const speed = commonInfo.estimatedSpeed;
    const eta = commonInfo.remainingTimeSec;
    const etaFormatted = eta !== null ? displayTime("", eta) : "N/A";
    const speedFormatted =
      speed !== null ? displayDifficulty(speed.speed) + "/s" : "N/A";
    const bar = "#".repeat(Math.round(partial * 50)).padEnd(50, " ");
    const attemptsCompleted = commonInfo.attempts;
    const attemptsCompletedFormatted = displayDifficulty(attemptsCompleted);

    const ecstaticFace = "😃";
    const smilingFace = "😊";
    const neutralFace = "😐";
    const sadFace = "😢";
    const catastrophicFace = "😱";
    const weepingFace = "😭";
    let face;
    if (commonInfo.luckFactor > 2) {
      face = ecstaticFace;
    } else if (unfortunateIteration == 0) {
      face = smilingFace;
    } else if (unfortunateIteration == 1) {
      face = neutralFace;
    } else if (unfortunateIteration == 2) {
      face = sadFace;
    } else if (unfortunateIteration == 3) {
      face = catastrophicFace;
    } else {
      face = weepingFace;
    }
    return (
      " --[" +
      bar +
      `]-- ${attemptsCompletedFormatted} ETA: ${etaFormatted} SPEED: ${speedFormatted} ITER: ${unfortunateIteration} LUCK: ${(commonInfo.luckFactor * 100).toFixed(1)}% ${face}`
    );
  }

  const opt = {
    format: formatter,
  };

  const bar1 = new cliProgress.SingleBar(
    opt,
    cliProgress.Presets.shades_classic,
  );

  bar1.start(1000, 0);
  for (let attempts = 1; ; attempts += 1) {
    if (randomDifficultyCheck(simulatedDifficulty / scalingFactor)) {
      bar1.stop();

      break;
    }
    await sleep(0.01 + Math.random() * 0.01); // Simulate some processing time

    est.addProvedWork(scalingFactor);
    const currentInfo = est.currentInfo();
    bar1.update(currentInfo.attempts);
  }
}

async function mainLoop() {
  for (let i = 0; i < 10000; i++) {
    await run();
    console.log(`Run ${i + 1} completed.`);
  }
}

mainLoop()
  .then(() => {
    console.log("Simulated random value found.");
  })
  .catch((error) => {
    console.error("Error in simulation:", error);
  });
