import { Estimator } from "./estimator/estimator";
import { GenerationPrefix } from "./params";
import { AppContext } from "./app_context";
import { ProofEntryResult } from "./estimator/proof";
import { ResultsService } from "./results_service";
import { EstimatorInfo } from "./estimator/estimator";

export interface EstimatorServiceOptions {
  disableMessageLoop?: boolean;
  messageLoopSecs?: number;
  processLoopSecs: number;
  vanityPrefix: GenerationPrefix; // Optional vanity prefix
  resultService: ResultsService;
}

export interface ReportCostResponse {
  accepted: boolean;
  reason: string;
}

export interface ProviderCurrentEstimate extends EstimatorInfo {
  jobId: string;
  unfortunateIteration: number;
  costPerHour?: number;
}

export interface EstimatorDynamicParams {
  minimumAcceptedSpeed: number;
  minimumAcceptedEfficiency: number;
}

export let uploaderJobId: string;

export class EstimatorService {
  private proofQueue: Map<string, ProofEntryResult[]> = new Map();

  private savedProofs: Map<string, null> = new Map();

  private estimators: Map<string, Estimator> = new Map();
  private costs: Map<string, number> = new Map();
  private totalEstimator: Estimator | null = null;
  private options;
  private ctx;

  private dynamicParams: EstimatorDynamicParams = {
    minimumAcceptedSpeed: parseFloat(process.env.SPEED_LOWER_THRESHOLD || "1"),
    minimumAcceptedEfficiency: parseFloat(
      process.env.EFFICIENCY_LOWER_THRESHOLD || "0.1",
    ),
  };

  constructor(ctx: AppContext, opt: EstimatorServiceOptions) {
    this.ctx = ctx;
    this.options = opt;
  }

  public getDynamicParams(): EstimatorDynamicParams {
    return structuredClone(this.dynamicParams);
  }

  public setDynamicParams(params: EstimatorDynamicParams): void {
    this.dynamicParams = structuredClone(params);
  }

  public allEstimatorsInfo(): object {
    const estimatorArray = [];
    for (const [jobId, estimator] of this.estimators.entries()) {
      estimatorArray.push({
        jobId: jobId,
        currentInfo: estimator.currentInfo(),
        currentCost: estimator.currentCost,
      });
    }
    return {
      estimators: estimatorArray,
      totalEstimator: this.totalEstimator
        ? this.totalEstimator.currentInfo()
        : null,
    };
  }

  public totalOnly(): object {
    return {
      totalEstimator: this.totalEstimator
        ? this.totalEstimator.currentInfo()
        : null,
    };
  }

  public getEstimator(jobId: string): Estimator {
    const job = this.estimators.get(jobId);
    if (!job) {
      throw new Error(`Estimator for job ${jobId} not found.`);
    }
    return job;
  }

  public async initJobIfNotInitialized(
    jobId: string,
    providerName: string,
    providerId: string,
    providerWalletAddress: string,
    diff: number,
  ) {
    if (!this.totalEstimator) {
      this.totalEstimator = new Estimator(diff, "total", "provider-total");
    }
    if (!this.estimators.has(jobId)) {
      const est = new Estimator(diff, providerName, providerId);
      this.estimators.set(jobId, est);

      const queue: ProofEntryResult[] = [];
      this.proofQueue.set(jobId, queue);
    }
  }

  // public async forceProcess() {
  //   await this.process();
  // }

  public async getCurrentEstimate(
    agreementId: string,
  ): Promise<ProviderCurrentEstimate> {
    await this.process(agreementId); // Ensure processing is done before getting the estimator
    const est = this.estimators.get(agreementId);
    if (!est) {
      throw new Error(`Estimator for job ${agreementId} not found.`);
    }
    const info = est.currentInfo();
    const unfortunateIteration = Math.floor(
      info.attempts / est.estimateAttemptsGivenProbability(0.5),
    );
    return {
      jobId: agreementId,
      ...info,
      costPerHour: info.estimatedSpeed?.costPerHour || 0,
      unfortunateIteration,
    };
  }

  public async process(agreementId: string): Promise<void> {
    const proofQueue = this.proofQueue.get(agreementId);
    this.proofQueue.set(agreementId, []); // Clear the proof queue after processing

    if (!proofQueue) {
      this.ctx.L().error(`No proof queue found for agreement ${agreementId}.`);
      throw new Error(`No proof queue found for agreement ${agreementId}.`);
    }

    const estimator = this.estimators.get(agreementId);
    if (!estimator) {
      this.ctx.L().error(`Estimator for job ${agreementId} not found.`);
      throw Error("Estimator not found for job: " + agreementId);
    }

    let totalWorkThisRun = 0;
    for (const entry of proofQueue) {
      const isUserPattern = entry.addr
        .toLowerCase()
        .startsWith(this.options.vanityPrefix.fullPrefix().toLowerCase());
      this.totalEstimator?.addProvedWork(entry.workDone, isUserPattern);
      estimator.addProvedWork(entry.workDone, isUserPattern);
      totalWorkThisRun += entry.workDone;

      if (this.savedProofs.has(entry.addr.toLowerCase())) {
        this.ctx
          .L()
          .warn(
            `Duplicate proof entry found for address: ${entry.addr.toLowerCase()}`,
          );
        continue; // Skip duplicate entries
      }
      this.savedProofs.set(entry.addr.toLowerCase(), null);
    }
    if (proofQueue.length > 0) {
      this.ctx.info(
        `Provider ${proofQueue[0].provider.name} found ${proofQueue.length} proofs and done: ${totalWorkThisRun} work`,
      );
    }
  }

  public checkIfProviderFailedToDoWork(
    ctx: AppContext,
    jobId: string,
    givenCost: number | null,
  ): boolean {
    return this.checkIfTerminate(ctx, jobId, givenCost);
  }

  public checkIfTerminate(
    ctx: AppContext,
    jobId: string,
    givenCost: number | null,
  ): boolean {
    const efficiencyLowerThreshold =
      this.dynamicParams.minimumAcceptedEfficiency;
    const speedLowerThreshold = this.dynamicParams.minimumAcceptedSpeed;
    const SPEED_ESTIMATION_TIMEFRAME = parseInt(
      process.env.SPEED_ESTIMATION_TIMEFRAME || "300",
    ); // 5 minutes in seconds
    const estimator = this.estimators.get(jobId);
    if (estimator) {
      if (estimator.stopping) {
        this.ctx.L().info(`Estimator for job ${jobId} is stopping.`);
        return true;
      }
      const info = estimator.currentInfo();

      let speedEstimation;

      if (givenCost !== null) {
        speedEstimation = estimator.estimatedSpeedGivenCost(
          SPEED_ESTIMATION_TIMEFRAME,
          givenCost,
        );
      } else {
        speedEstimation = estimator.estimatedSpeed(SPEED_ESTIMATION_TIMEFRAME);
      }

      if (info.cost > 0) {
        if (
          speedEstimation.efficiency &&
          (speedEstimation.efficiency < efficiencyLowerThreshold ||
            speedEstimation.speed < speedLowerThreshold)
        ) {
          estimator.stopping = true;
          return true;
        }
      }
    }
    return false;
  }

  private get messageLoopSecs(): number {
    return this.options.messageLoopSecs || 30.0;
  }

  public reportCosts(jobId: string, cost: number): ReportCostResponse {
    const job = this.estimators.get(jobId);
    if (!job) {
      return {
        accepted: false,
        reason: `Estimator for job ${jobId} not found.`,
      };
    }
    if (job.currentInfo().attempts == 0) {
      return {
        accepted: false,
        reason: `No work made for job ${jobId}.`,
      };
    }
    job.setCurrentCost(cost);
    job.addProvedWork(0);

    let totalCost = 0;
    for (const estimator of this.estimators.values()) {
      totalCost += estimator.currentCost;
    }
    this.totalEstimator?.setCurrentCost(totalCost);
    return {
      accepted: true,
      reason: `Cost for job ${jobId} accepted: ${cost} GLM.`,
    };
  }

  public reportEmpty(jobId: string) {
    const job = this.estimators.get(jobId);
    if (!job) {
      return;
    }
    job.addProvedWork(0);

    this.totalEstimator?.addProvedWork(0);
  }

  public pushProofToQueue(result: ProofEntryResult): boolean {
    const jId = result.jobId;
    const queue = this.proofQueue.get(jId);
    if (!queue) {
      this.ctx.L().error(`No proof queue found for job ${jId}.`);
      throw new Error(`No proof queue found for job ${jId}.`);
    }
    queue.push(result);
    return true;
  }
}
