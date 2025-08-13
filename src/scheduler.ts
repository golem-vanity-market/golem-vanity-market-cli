import { BudgetMonitor } from "./budget";
import type { GolemSessionManager } from "./node_manager/golem_session";
import {
  type AppContext,
  setIterationNo,
  withJobId,
  withWorkerNo,
} from "./app_context";
import type { GenerationParams } from "./params";
import type { EstimatorService } from "./estimator_service";
import type { SchedulerRecorder } from "./scheduler/types";
import { v4 as uuidv4 } from "uuid";
import { getProviderEstimatorSummaryMessage } from "./ui/displaySummary";
import { sleep } from "@golem-sdk/golem-js";

/**
 * The purpose of the Scheduler is to continuously generate tasks until either enough addresses are found or the budget is exhausted.
 */
export class Scheduler {
  schedulerRecorder: SchedulerRecorder;
  iterationNo = 0;
  _generationParams: GenerationParams | null;
  constructor(
    private readonly sessionManager: GolemSessionManager,
    private readonly estimator: EstimatorService,
    recorder: SchedulerRecorder,
  ) {
    this.schedulerRecorder = recorder;
    this._generationParams = null;
  }

  public generationParams(): GenerationParams | null {
    return this._generationParams;
  }

  public async runGenerationProcess(
    ctx: AppContext,
    params: GenerationParams,
  ): Promise<void> {
    const jobId = uuidv4();

    await this.schedulerRecorder.startGenerationJob(
      ctx,
      jobId,
      params,
      this.sessionManager.getProcessingUnitType(),
    );

    const budgetMonitor = new BudgetMonitor(
      this.sessionManager,
      params.budgetTopUp,
      params.budgetLimit,
    );

    budgetMonitor.startMonitoring({
      onAllocationAmendError: (error) => {
        ctx.error(`Error monitoring and amending budget: ${error}`);
        ctx.consoleError(
          "⚠️ Cannot extend allocation, do you have enough GLMs? Stopping work ...",
        );
        this.sessionManager.stopWork("Cannot extend allocation");
      },
      onAllocationAmendSuccess: (allocation) => {
        ctx.info(
          `Extended allocation to (timeout=${allocation.timeout}, budget=${allocation.totalAmount})`,
        );
        budgetMonitor.displayBudgetInfo(ctx, allocation);
      },
      onBudgetExhausted: () => {
        ctx.info("Budget exhausted, stopping work ...");
        ctx.consoleInfo("💰⚠️ Budget exhausted, stopping work ...");
        this.sessionManager.stopWork("Budget exhausted");
      },
    });

    ctx.consoleInfo(
      `🔨 Starting work with ${params.numberOfWorkers} concurrent providers...`,
    );
    const newCtx = withJobId(ctx, jobId);
    // Create and start multiple providers in parallel

    const workerPromises = [];

    for (let i = 0; i < params.numberOfWorkers; i++) {
      this._generationParams = params;

      workerPromises.push(this.workInLoop(withWorkerNo(newCtx, i), params));
      await sleep(0.3);
    }

    await Promise.allSettled(workerPromises);

    budgetMonitor.stop();

    ctx.consoleInfo(
      `✅ Generation process completed. Found ${this.sessionManager.noResults}/${params.numResults} addresses.`,
    );
  }

  /**
   * Runs work continuously until the main generation goals are met or work is stopped.
   * Note that `sessionManager.runSingleIteration` is _not_ guaranteed to run on the same
   * provider each time.
   */
  private async workInLoop(
    ctx: AppContext,
    params: GenerationParams,
  ): Promise<void> {
    // This loop continues as long as the overall job is not done
    while (!this.sessionManager.isWorkStopped()) {
      this.iterationNo += 1;
      const iterationNo = this.iterationNo;
      // Check if the target number of results is reached
      if (this.sessionManager.noResults >= params.numResults) {
        ctx.info(
          `Reached the target number of results: ${this.sessionManager.noResults}/${params.numResults}. Stopping work.`,
        );
        ctx.consoleInfo(
          `🥳 Reached the target number of results: ${this.sessionManager.noResults}/${params.numResults}. Stopping work.`,
        );
        this.sessionManager.stopWork("Target number of results reached"); // Stop all other providers
        break; // Exit the loop if the target is reached
      }

      try {
        // A single provider runs one iteration. When it's done, the loop
        // will check conditions again and start another if needed.
        const iterInfo = await this.sessionManager.runSingleIteration(
          setIterationNo(ctx, iterationNo),
          params,
        );

        if (iterInfo == null) {
          ctx.info(`No provider available`);
          await sleep(5);
          continue;
        }
        const esp = await this.estimator.getCurrentEstimate(
          iterInfo.agreementId,
        );

        ctx
          .L()
          .info(
            `Provider: ${iterInfo.provider.name}, estimated speed: ${esp.estimatedSpeed1h}, total successes: ${esp.totalSuccesses}, remaining time: ${esp.remainingTimeSec} seconds`,
          );

        ctx.consoleInfo(
          getProviderEstimatorSummaryMessage(esp, iterInfo.provider.name),
        );
        // TODO: add here the reputation model update
      } catch (error) {
        if (this.sessionManager.isWorkStopped()) {
          // we can safely assume that the error is due to the work being stopped
          ctx.info(`Work was stopped, exiting the provider loop.`);
          break;
        }
        ctx.error(`Unhandled error during a provider iteration: ${error}`);
        await sleep(5);
        // don't rethrow the error, just continue the loop, we'll get another provider
        // next time we call `runSingleIteration`
      }
    }
  }
}
