import { displayDifficulty, displayTime } from "../utils/format";

export interface EstimatorInfo {
  attempts: number;
  totalSuccesses: number;
  luckFactor: number;
  probabilityFactor: number;
  remainingTimeSec: number | null;
  estimatedSpeed: SpeedEstimation | null;
  estimatedSpeed5m: SpeedEstimation;
  estimatedSpeed10m: SpeedEstimation;
  estimatedSpeed20m: SpeedEstimation;
  estimatedSpeed1h: SpeedEstimation;
  providerName: string;
  providerId: string;
  cost: number;
  lastUpdated: Date;
  totalEfficiency: number | null;
  // @todo This field should be elsewhere, but we lack object that is keeping job state and allows to control job
  stopping?: boolean; // Optional field to indicate if the estimation is stopping
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
  efficiency: number | null; // Default value, can be set later
  speed: number;
  costPerHour: number;

  constructor(
    currentTimePoint: Date,
    startTimePoint: Date,
    currentAttempts: number,
    startAttempts: number,
    currentCost: number = 0, // Default value, can be set later
    startCost: number = 0, // Default value, can be set later
    efficiency: number | null = null, // Default value, can be set later
  ) {
    this.currentTimePoint = currentTimePoint;
    this.startTimePoint = startTimePoint;
    this.currentAttempts = currentAttempts;
    this.startAttempts = startAttempts;
    this.currentCost = currentCost;
    this.startCost = startCost;
    this.efficiency = efficiency;
    this.speed = this._speed();
    this.costPerHour = this._costPerHour();
  }

  _speed(): number {
    const timeDiff =
      this.currentTimePoint.getTime() - this.startTimePoint.getTime();
    if (timeDiff <= 0) {
      return 0;
    }
    return (this.currentAttempts - this.startAttempts) / (timeDiff / 1000); // Speed in attempts per second
  }

  _costPerHour(): number {
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
  providerId: string;
  currentCost: number = 0;
  stopping: boolean = false; // Flag to indicate if the estimation is stopping
  _entries: EstimatorHistoryEntry[] = [];

  constructor(targetDifficulty: number, provName: string, providerId: string) {
    this.targetDifficulty = targetDifficulty;
    this.providerName = provName;
    this.providerId = providerId;
    this.addProvedWork(0);
  }

  private _appendEntry(entry: EstimatorHistoryEntry) {
    this._entries.push(entry);
    if (this._entries.length > MAX_HISTORY_SIZE) {
      this._entries.splice(0, HISTORY_TRUNCATE_AT_ONCE); // Keep the history size manageable
    }
  }

  _findOldestUsableEntry(): EstimatorHistoryEntry {
    if (this._entries.length < MAX_USABLE_HISTORY_SIZE) {
      return this._entries[0];
    }
    return this._entries[this._entries.length - MAX_USABLE_HISTORY_SIZE];
  }

  _getOldestRecentEntry(maxAgeSec: number): EstimatorHistoryEntry {
    const cutoff =
      this._entries[this._entries.length - 1].timePoint.getTime() -
      maxAgeSec * 1000;

    for (let i = 0; i < this._entries.length; i++) {
      if (this._entries[i].timePoint.getTime() >= cutoff) {
        return this._entries[i];
      }
    }

    return this._entries[this._entries.length - 1];
  }

  _findNewestUsableEntry(): EstimatorHistoryEntry {
    return this._entries[this._entries.length - 1];
  }

  _lastUpdated(): Date {
    if (this._entries.length === 0) {
      return new Date(0); // Return epoch if no entries
    }
    return this._entries[this._entries.length - 1].timePoint;
  }

  info() {
    console.log(`Target difficulty: ${this.targetDifficulty}`);
  }

  estimateTime(): number | null {
    //by default estimate this base on last 10 minutes
    const speed = this.estimatedSpeed(600);
    if (speed === null || speed.speed <= 0) {
      return null;
    }
    return this.targetDifficulty / speed.speed;
  }

  public setCurrentCost(cost: number) {
    this.currentCost = cost;
  }

  public addProvedWork(attempts: number, isSuccess: boolean = false) {
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

  estimatedSpeed(timeFrameSecs: number): SpeedEstimation {
    const entryOld = this._getOldestRecentEntry(timeFrameSecs);
    const entryNew = this._findNewestUsableEntry();

    let efficiency = null;
    if (entryNew.cost - entryOld.cost > 0) {
      efficiency =
        (entryNew.attempts - entryOld.attempts) /
        (entryNew.cost - entryOld.cost) /
        1e12; // Efficiency in TH/GLM
    }

    return new SpeedEstimation(
      new Date(entryNew.timePoint),
      new Date(entryOld.timePoint),
      entryNew.attempts,
      entryOld.attempts,
      entryNew.cost,
      entryOld.cost,
      efficiency,
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
    const estimatedSpeed1h = this.estimatedSpeed(3600);
    const estimatedSpeed20m = this.estimatedSpeed(20 * 60);
    const estimatedSpeed10m = this.estimatedSpeed(10 * 60);
    const estimatedSpeed5m = this.estimatedSpeed(5 * 60);
    const estimatedSpeed = this.estimatedSpeed(60);

    const totalEfficiency =
      this.currentCost > 0
        ? this.totalAttempts / this.currentCost / 1e12
        : null;
    return {
      totalSuccesses: this.totalSuccesses,
      attempts: this.totalAttempts,
      luckFactor: luckFactor,
      probabilityFactor: this.estimateProbability(this.currentAttempts),
      remainingTimeSec: remainingTimeSec,
      estimatedSpeed: estimatedSpeed,
      estimatedSpeed5m: estimatedSpeed5m,
      estimatedSpeed10m: estimatedSpeed10m,
      estimatedSpeed20m: estimatedSpeed20m,
      estimatedSpeed1h: estimatedSpeed1h,
      providerName: this.providerName,
      providerId: this.providerId,
      cost: this.currentCost,
      lastUpdated: this._lastUpdated(),
      totalEfficiency,
      stopping: this.stopping || false, // Include stopping status
    };
  }
}
