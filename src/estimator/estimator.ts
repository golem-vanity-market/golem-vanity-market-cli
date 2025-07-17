import { displayDifficulty, displayTime } from "../utils/format";

export interface EstimatorInfo {
  attempts: number;
  totalSuccesses: number;
  luckFactor: number;
  probabilityFactor: number;
  remainingTimeSec: number | null;
  estimatedSpeed: SpeedEstimation | null;
  provName: string;
  cost: number;
}

export function formatEstimatorInfo(info: EstimatorInfo) {
  const attemptsStr = displayDifficulty(info.attempts);
  const _luckFactorStr = (info.luckFactor * 100).toFixed(1) + "%";
  const probFactorStr = (info.probabilityFactor * 100).toFixed(1) + "%";
  const remainingTime =
    info.remainingTimeSec !== null
      ? displayTime("", info.remainingTimeSec)
      : "N/A";
  const estimatedSpeed =
    info.estimatedSpeed !== null
      ? displayDifficulty(info.estimatedSpeed.speed) + "s"
      : "N/A";

  return `Attempts: ${attemptsStr} | Prob ${probFactorStr} | Remaining Time: ${remainingTime} | Estimated Speed: ${estimatedSpeed}`;
}

interface EstimatorHistoryEntry {
  timePoint: Date;
  attempts: number;
  successes: number;
  cost: number;
}

class SpeedEstimation {
  currentTimePoint: Date;
  startTimePoint: Date;
  currentAttempts: number;
  startAttempts: number;
  currentCost: number; // Default value, can be set later
  startCost: number;

  constructor(
    currentTimePoint: Date,
    startTimePoint: Date,
    currentAttempts: number,
    startAttempts: number,
    currentCost: number = 0, // Default value, can be set later
    startCost: number = 0, // Default value, can be set later
  ) {
    this.currentTimePoint = currentTimePoint;
    this.startTimePoint = startTimePoint;
    this.currentAttempts = currentAttempts;
    this.startAttempts = startAttempts; // Default value, can be set later
    this.currentCost = currentCost;
    this.startCost = startCost; // Default value, can be set later
  }

  get speed(): number {
    const timeDiff =
      this.currentTimePoint.getTime() - this.startTimePoint.getTime();
    if (timeDiff <= 0) {
      return 0;
    }
    return (this.currentAttempts - this.startAttempts) / (timeDiff / 1000); // Speed in attempts per second
  }

  get costPerHour(): number {
    const timeDiff =
      this.currentTimePoint.getTime() - this.startTimePoint.getTime();
    if (timeDiff <= 0) {
      return 0;
    }
    return (this.currentCost - this.startCost) / (timeDiff / 3600000); // Cost per hour
  }
}

const MAX_HISTORY_SIZE = 1000;
const HISTORY_TRUNCATE_AT_ONCE = 100;
const MAX_USABLE_HISTORY_SIZE = MAX_HISTORY_SIZE - HISTORY_TRUNCATE_AT_ONCE;
export class Estimator {
  targetDifficulty: number;
  currentAttempts: number = 0;
  totalAttempts: number = 0; // Total attempts made
  totalSuccesses: number = 0;
  providerName: string;
  currentCost: number = 0;
  _entries: EstimatorHistoryEntry[] = [];

  constructor(targetDifficulty: number, provName: string) {
    this.targetDifficulty = targetDifficulty;
    this.providerName = provName;
    this.addProvedWork(0);
  }

  private _appendEntry(entry: EstimatorHistoryEntry) {
    this._entries.push(entry);
    if (this._entries.length > MAX_HISTORY_SIZE) {
      this._entries.splice(0, HISTORY_TRUNCATE_AT_ONCE); // Keep the history size manageable
    }
  }

  _findLastUsableEntry(): EstimatorHistoryEntry {
    if (this._entries.length < MAX_USABLE_HISTORY_SIZE) {
      return this._entries[0];
    }
    return this._entries[this._entries.length - MAX_USABLE_HISTORY_SIZE];
  }

  info() {
    console.log(`Target difficulty: ${this.targetDifficulty}`);
  }

  estimateTime(): number | null {
    const speed = this.estimatedSpeed();
    if (speed === null || speed.speed <= 0) {
      return null;
    }
    return this.targetDifficulty / speed.speed;
  }

  public setCurrentCost(cost: number) {
    this.currentCost = cost;
  }

  public async addProvedWork(attempts: number, isSuccess: boolean = false) {
    if (isSuccess) {
      this.currentAttempts = 0; // Reset attempts on success
    } else {
      this.currentAttempts += attempts;
    }
    this.totalAttempts += attempts;
    if (isSuccess) {
      this.totalSuccesses += 1;
    }
    this._appendEntry({
      timePoint: new Date(),
      attempts: this.totalAttempts,
      successes: this.totalSuccesses,
      cost: this.currentCost,
    });
  }

  estimatedSpeed(): SpeedEstimation | null {
    const entry = this._findLastUsableEntry();
    const startTimePoint = entry.timePoint;

    return new SpeedEstimation(
      new Date(),
      new Date(startTimePoint),
      this.totalAttempts,
      entry ? entry.attempts : 0,
      this.currentCost,
      entry ? entry.cost : 0,
    );
  }

  estimateProbability(attempts: number): number {
    if (attempts <= 0) {
      return 0;
    }

    return 1 - Math.pow(1 - 1 / this.targetDifficulty, attempts);
  }

  estimateAttemptsGivenProbability(probability: number): number {
    if (probability < 0 || probability > 1) {
      throw new Error("Probability must be between 0 and 1.");
    }

    return Math.log(1 - probability) / Math.log(1 - 1 / this.targetDifficulty);
  }

  luckFactor(attempts: number): number {
    if (attempts <= 0) {
      return Number.POSITIVE_INFINITY;
    }

    const probability = this.estimateProbability(attempts);
    return 1 / probability - 1;
  }

  currentInfo(): EstimatorInfo {
    if (this.currentAttempts < 0) {
      throw new Error("Number of attempts must be greater than zero.");
    }

    const luckFactor = this.luckFactor(this.currentAttempts);
    const remainingTimeSec = this.estimateTime();
    const estimatedSpeed = this.estimatedSpeed();

    return {
      totalSuccesses: this.totalSuccesses,
      attempts: this.totalAttempts,
      luckFactor: luckFactor,
      probabilityFactor: this.estimateProbability(this.currentAttempts),
      remainingTimeSec: remainingTimeSec,
      estimatedSpeed: estimatedSpeed,
      provName: this.providerName,
      cost: this.currentCost,
    };
  }
}
