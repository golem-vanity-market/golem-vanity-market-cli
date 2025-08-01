import { BudgetMonitor } from "./budget";
import {
  GolemSessionManager,
  OnErrorHandler,
} from "./node_manager/golem_session";
import { AppContext, setJobId } from "./app_context";
import { GenerationParams } from "./params";
import { EstimatorService } from "./estimator_service";
import { getProviderEstimatorSummaryMessage } from "./ui/displaySummary";
import { Problem } from "./lib/db/schema";
import { SchedulerRecorder } from "./scheduler/types";
import { v4 as uuidv4 } from "uuid";

/**
 * The purpose of the Scheduler is to continuously generate tasks until either enough addresses are found or the budget is exhausted.
 */
export class Scheduler {
  schedulerRecorder: SchedulerRecorder;
  constructor(
    private readonly sessionManager: GolemSessionManager,
    private readonly estimator: EstimatorService,
    recorder: SchedulerRecorder,
  ) {
    this.schedulerRecorder = recorder;
  }

  public async runGenerationProcess(
    ctx: AppContext,
    params: GenerationParams,
  ): Promise<void> {
    const jobId = uuidv4();

    const problem: Problem = {
      type: "prefix",
      specifier: params.vanityAddressPrefix.fullPrefix(),
    };

    this.schedulerRecorder.startGenerationJob(
      ctx,
      jobId,
      problem,
      params,
      this.sessionManager.getProcessingUnitType(),
    );

    const onError: OnErrorHandler = async ({ error, provider }) => {
      ctx
        .L()
        .info(
          `Provider ${provider.name} encountered an error: ${error.message}. Removing them from the pool.`,
        );
      // Determine if the error is recoverable and update reputation here
      return false; // Destroy the rental
    };

    const budgetMonitor = new BudgetMonitor(
      this.sessionManager,
      params.budgetTopUp,
      params.budgetLimit,
    );

    budgetMonitor.startMonitoring({
      onAllocationAmendError: (error) => {
        ctx.L().error("Error monitoring and amending budget:", error);
        ctx.consoleError(
          "⚠️ Cannot extend allocation, do you have enough GLMs? Stopping work ...",
        );
        this.sessionManager.stopWork("Cannot extend allocation");
      },
      onAllocationAmendSuccess: (allocation) => {
        ctx
          .L()
          .info(
            `Extended allocation to (timeout=${allocation.timeout}, budget=${allocation.totalAmount})`,
          );
        budgetMonitor.displayBudgetInfo(ctx, allocation);
      },
      onBudgetExhausted: () => {
        ctx.L().info("Budget exhausted, stopping work ...");
        ctx.consoleInfo("💰⚠️ Budget exhausted, stopping work ...");
        this.sessionManager.stopWork("Budget exhausted");
      },
    });

    console.log(
      `🔨 Starting work with ${params.numberOfWorkers} concurrent providers...`,
    );

    const newCtx = setJobId(ctx, jobId);
    // Create and start multiple providers in parallel
    const workerPromises = Array.from({ length: params.numberOfWorkers }, () =>
      this.workInLoop(newCtx, params, onError),
    );

    await Promise.allSettled(workerPromises);

    budgetMonitor.stop();

    console.log(
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
    onError: OnErrorHandler,
  ): Promise<void> {
    // This loop continues as long as the overall job is not done
    while (!this.sessionManager.isWorkStopped()) {
      // Check if the target number of results is reached
      if (this.sessionManager.noResults >= params.numResults) {
        ctx
          .L()
          .info(
            `Reached the target number of results: ${this.sessionManager.noResults}/${params.numResults}. Stopping work.`,
          );
        console.log(
          `🥳 Reached the target number of results: ${this.sessionManager.noResults}/${params.numResults}. Stopping work.`,
        );
        this.sessionManager.stopWork("Target number of results reached"); // Stop all other providers
        break; // Exit the loop if the target is reached
      }

      try {
        // A single provider runs one iteration. When it's done, the loop
        // will check conditions again and start another if needed.
        const iterInfo = await this.sessionManager.runSingleIteration(
          ctx,
          params,
          onError,
        );

        if (iterInfo == null) {
          ctx.L().info("No provider available, trying again.");
          console.log("No provider available, trying again.");
          continue;
        }
        const esp = await this.estimator.getCurrentEstimate(
          iterInfo.agreementId,
        );

        ctx
          .L()
          .info(
            `Provider: ${iterInfo.provider.name}, estimated speed: ${esp.estimatedSpeed}, total successes: ${esp.totalSuccesses}, remaining time: ${esp.remainingTimeSec} seconds`,
          );

        ctx.consoleInfo(
          getProviderEstimatorSummaryMessage(esp, iterInfo.provider.name),
        );

        // TODO: add here the reputation model update
      } catch (error) {
        if (this.sessionManager.isWorkStopped()) {
          // we can safely assume that the error is due to the work being stopped
          ctx.L().info("Work was stopped, exiting the provider loop.");
          break;
        }
        ctx.L().error("Unhandled error during a provider iteration:", error);
        console.error("Error in provider, continuing if possible:", error);
        // don't rethrow the error, just continue the loop, we'll get another provider
        // next time we call `runSingleIteration`
      }
    }
  }
}
