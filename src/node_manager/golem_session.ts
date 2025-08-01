// External imports
import {
  Allocation,
  DraftOfferProposalPool,
  GolemNetwork,
  ProviderInfo,
  ResourceRental,
  ResourceRentalPool,
} from "@golem-sdk/golem-js";
import { isNativeError } from "util/types";

// Internal imports
import { AppContext, getJobId } from "../app_context";
import { GenerationParams, ProcessingUnitType } from "../params";
import { BaseRentalConfig, CPURentalConfig, GPURentalConfig } from "./config";
import { computePrefixDifficulty } from "../difficulty";
import { withTimeout } from "../utils/timeout";
import { EstimatorService } from "../estimator_service";
import { ResultsService } from "../results_service";
import { VanityPaymentModule } from "./payment_module";
import {
  parseVanityResults,
  IterationInfo,
  ParsedResults,
  CommandResult,
  VanityResult,
} from "./result";
import { ProofEntryResult } from "../estimator/proof";
import { displayDifficulty } from "../utils/format";
import {
  validateAddressMatchPattern,
  validateVanityResult,
} from "../validator";

import {
  getJobProviderID,
  GolemSessionRecorder,
  withJobProviderID,
} from "./types";

/**
 * Parameters for the GolemSessionManager constructor
 */
export interface SessionManagerParams {
  /** Rental duration in seconds */
  rentalDurationSeconds: number;

  /** Initial allocation size in GLMs */
  budgetInitial: number;

  /** Type of processing unit to use (CPU or GPU) */
  processingUnitType: ProcessingUnitType;

  estimatorService: EstimatorService;

  resultService: ResultsService;
}

// Callbacks for `runSingleIteration` method
export type OnErrorHandler = (payload: {
  error: Error;
  provider: ProviderInfo;
}) => Promise<boolean>;

/**
 * The purpose of the GolemSessionManager is to abstract the complexity of managing
 * the entire lifecycle of executing tasks on Golem Network.
 * It handles connecting to the network, allocating resources, looking for offers,
 * running commands and collecting results.
 */
export class GolemSessionManager {
  private rentalDurationSeconds: number;
  private budgetInitial: number;
  private processingUnitType: ProcessingUnitType;
  private golemNetwork?: GolemNetwork;
  private allocation?: Allocation;
  private rentalPool?: ResourceRentalPool;
  private estimatorService: EstimatorService;
  private resultService: ResultsService;
  private stopWorkAC: AbortController = new AbortController();
  private dbRecorder: GolemSessionRecorder;

  constructor(params: SessionManagerParams, recorder: GolemSessionRecorder) {
    this.rentalDurationSeconds = params.rentalDurationSeconds;
    this.budgetInitial = params.budgetInitial;
    this.processingUnitType = params.processingUnitType;
    this.estimatorService = params.estimatorService;
    this.resultService = params.resultService;
    this.dbRecorder = recorder;
  }

  public saveResultsToFile(filePath: string): void {
    this.resultService.saveResultsToFile(filePath);
  }

  public get noResults(): number {
    return this.resultService.numberOfResults;
  }

  public async connectToGolemNetwork(ctx: AppContext): Promise<void> {
    VanityPaymentModule.estimatorService = this.estimatorService;
    VanityPaymentModule.ctx = ctx;
    this.golemNetwork = new GolemNetwork({
      logger: ctx.L(),
      override: {
        payment: VanityPaymentModule,
      },
    });
    try {
      await this.golemNetwork.connect();
      ctx.L().info("Connected to Golem Network successfully");
    } catch (error) {
      ctx.L().error("Failed to connect to Golem Network:", error);
      throw new Error("Connection to Golem Network failed");
    }
    this.golemNetwork.market.events.on("agreementApproved", ({ agreement }) => {
      ctx.consoleInfo(`📃 Signed an agreement with ${agreement.provider.name}`);
    });
    this.golemNetwork.market.events.on(
      "agreementTerminated",
      ({ agreement }) => {
        ctx.consoleInfo(
          `🗑️ Terminated agreement with ${agreement.provider.name}`,
        );
      },
    );
  }

  public getAllocationId(): string {
    if (!this.allocation) {
      throw new Error("Allocation is not initialized");
    }
    return this.allocation.id;
  }

  public getGolemNetwork(): GolemNetwork {
    if (!this.golemNetwork) {
      throw new Error("Golem Network is not initialized");
    }
    return this.golemNetwork;
  }

  public stopWork(message?: string): void {
    this.stopWorkAC.abort(message || "Work stopped by user");
  }

  public isWorkStopped(): boolean {
    return this.stopWorkAC.signal.aborted;
  }

  public getProcessingUnitType(): ProcessingUnitType {
    return this.processingUnitType;
  }

  public getConfigBasedOnProcessingUnitType(
    cruncherVersion?: string,
  ): BaseRentalConfig {
    switch (this.processingUnitType) {
      case ProcessingUnitType.CPU:
        return new CPURentalConfig(cruncherVersion);
      case ProcessingUnitType.GPU:
        return new GPURentalConfig(cruncherVersion);
      default:
        throw new Error(
          `Unsupported processing unit type: ${this.processingUnitType}`,
        );
    }
  }

  public async initializeRentalPool(ctx: AppContext): Promise<void> {
    if (!this.golemNetwork) {
      ctx
        .L()
        .error(
          "Golem Network is not initialized. Call connectToGolemNetwork first.",
        );
      throw new Error("Golem Network is not initialized");
    }

    this.golemNetwork.payment.events.on(
      "allocationCreated",
      ({ allocation }) => {
        ctx.consoleInfo(
          "Allocation created with budget:",
          Number(allocation.remainingAmount).toFixed(2),
        );
      },
    );

    const glm = this.golemNetwork;
    const rentalDurationWithPaymentsSeconds = this.rentalDurationSeconds + 360;

    try {
      this.allocation = await glm.payment.createAllocation({
        budget: this.budgetInitial,
        expirationSec: Math.round(rentalDurationWithPaymentsSeconds),
        paymentPlatform: "erc20-polygon-glm",
      });

      this.rentalPool = await glm.manyOf({
        poolSize: {
          min: 0,
          max: 100,
        }, //unused in our case, we are managing pool size manually
        order: this.getConfigBasedOnProcessingUnitType().getOrder(
          this.rentalDurationSeconds,
          this.allocation,
        ),
      });
    } catch (error) {
      ctx.L().error("Failed to initialize rental pool:", error);
      throw error;
    }
  }

  public async waitForEnoughOffers(
    ctx: AppContext,
    numOffers: number,
    timeoutSec: number,
  ): Promise<void> {
    if (!this.rentalPool) {
      ctx
        .L()
        .error(
          "Rental pool is not initialized. Call initializeRentalPool first.",
        );
      throw new Error("Rental pool is not initialized");
    }
    const proposalPool: DraftOfferProposalPool =
      this.rentalPool["proposalPool"];
    const isEnough = () => proposalPool.availableCount() >= numOffers;

    if (isEnough()) {
      ctx
        .L()
        .info(
          `Found enough offers immediately: ${proposalPool.availableCount()} >= ${numOffers}`,
        );
      return;
    }

    return new Promise<void>((resolve) => {
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        proposalPool.events.off("added", onProposalAdded);
      };

      const onProposalAdded = () => {
        if (isEnough()) {
          ctx
            .L()
            .info(
              `Found enough offers: ${proposalPool.availableCount()} >= ${numOffers}`,
            );
          cleanup();
          resolve();
          return;
        }
        ctx
          .L()
          .info(
            `Current offers: ${proposalPool.availableCount()}, waiting for ${numOffers} offers...`,
          );
      };
      const timeoutId = setTimeout(() => {
        cleanup();
        ctx
          .L()
          .warn(
            `Timeout reached: ${timeoutSec} seconds, current offers: ${proposalPool.availableCount()}`,
          );
        resolve();
      }, timeoutSec * 1000);

      proposalPool.events.on("added", onProposalAdded);
    });
  }

  private async runCommand(
    ctx: AppContext,
    rental: ResourceRental,
    generationParams: GenerationParams,
  ): Promise<CommandResult> {
    const config = this.getConfigBasedOnProcessingUnitType();

    const agreementId = rental.agreement.id;

    try {
      // Get or create the exe unit
      const exe = await rental.getExeUnit();

      const provider = exe.provider;

      ctx
        .L()
        .info(
          `Running command on provider: ${provider.name}, type: ${this.processingUnitType}`,
        );

      // Validate capabilities (CPU or GPU specific)
      await config.checkAndSetCapabilities(exe);

      /* Uncomment this to simulate random execution time
      const simulateRandomExecutionTime = true;

      if (simulateRandomExecutionTime) {
        generationParams.singlePassSeconds = Math.floor(
          20 + 100 * Math.random(),
        );
      }
      */
      const command = config.generateCommand(generationParams);
      ctx.L().info(`Executing command: ${command}`);

      //TODO Reputation
      //is that the best place?

      this.dbRecorder.jobStarted(ctx, getJobProviderID(ctx));

      const res = await exe.run(command, {
        signalOrTimeout: this.stopWorkAC.signal,
      });

      /* Uncomment this code to parse reported compute stats
      let biggestCompute = 0;
      const stderr = res.stderr ? String(res.stderr) : "";
      for (const line of stderr.split("\n")) {
        //ctx.L().info(line);
        if (line.includes("Total compute")) {
          try {
            const totalCompute = line
              .split("Total compute ")[1]
              .trim()
              .split(" GH")[0];
            const totalComputeFloatGh = parseFloat(totalCompute);
            biggestCompute = totalComputeFloatGh * 1e9;
          } catch (e) {
            ctx.L().error("Error parsing compute stats:", e);
          }
        }
      }

       */

      //TODO reputation
      //push all proofs to db
      //process results and set hashrate/offences/glmspent
      this.dbRecorder.jobCompleted(ctx, getJobProviderID(ctx));

      const stdout = res.stdout ? String(res.stdout) : "";

      const parsedResults: ParsedResults = parseVanityResults(
        ctx,
        stdout.split("\n"),
        generationParams.vanityAddressPrefix.fullPrefix(),
        computePrefixDifficulty,
      );

      const cmdResult: CommandResult = {
        agreementId,
        provider,
        durationSeconds: generationParams.singlePassSeconds,
        results: parsedResults.results,
        failedLines: parsedResults.failedLines,
        status: "success",
        providerType: this.processingUnitType,
      };

      if (cmdResult.failedLines.length > 0) {
        //TODO reputation
        // push proofs to table
        // if some failed to parse, set offense to nonsense
        this.dbRecorder.resultFailedParsing(ctx, getJobProviderID(ctx));

        ctx.L().error("failed to parse lines:", cmdResult.failedLines);
        throw new Error("Failed to parse result lines");
      }

      if (cmdResult.results.length === 0) {
        // TODO: inform estimator and reputation model
        ctx.L().info("No results found in the output");
        cmdResult.status = "not_found";
        return cmdResult;
      }
      ctx
        .L()
        .info(
          `Found ${cmdResult.results.length} results for job ${agreementId}`,
        );
      return cmdResult;
    } catch (error) {
      if (this.stopWorkAC.signal.aborted) {
        ctx.L().info("Work was stopped by user");
        this.dbRecorder.jobStopped(ctx, getJobProviderID(ctx));
        return {
          agreementId,
          provider: rental.agreement.provider,
          durationSeconds: 0,
          status: "stopped",
          results: [],
          failedLines: [],
          providerType: this.processingUnitType,
        };
      }
      // TODO: inform estimator and reputation model
      ctx.L().error(`Error during profanity_cuda execution: ${error}`);
      this.dbRecorder.jobFailed(ctx, getJobProviderID(ctx), String(error));

      throw new Error("Profanity execution failed");
    }
  }

  /**
   * The `onResult` should resolve to `true` if the result is satisfactory and
   * the rental should be returned to the pool, or `false` if the rental should be
   * terminated and a new one should be acquired in it's place.
   * Similarly, the `onError` should resolve to `true` if the error is
   * recoverable and the rental should be returned to the pool, or `false` if
   * the rental should be terminated and a new one should be acquired in it's place.
   *
   * This method will throw if acquiring a rental fails, or if releasing or
   * destroying a rental fails.
   */
  public async runSingleIteration(
    ctx: AppContext,
    generationParams: GenerationParams,
    onError: OnErrorHandler,
  ): Promise<IterationInfo | null> {
    if (this.stopWorkAC.signal.aborted) {
      ctx.L().info("Work was stopped by user");
      return null;
    }
    if (!this.golemNetwork || !this.allocation || !this.rentalPool) {
      ctx
        .L()
        .error(
          "Cannot run command without initialized Golem Network, allocation and rental pool.",
        );
      throw new Error(
        "Golem Network, allocation or rental pool is not initialized",
      );
    }

    let wasSuccess = true;

    const rental = await this.rentalPool.acquire(this.stopWorkAC.signal); // wait as long as needed to find a provider (cancelled by stopWorkAC)
    const providerName = rental.agreement.provider.name;

    let shouldKeepRental: boolean;
    let r: CommandResult | null = null;

    // TODO Reputation select additional problems for hashrateverification
    const provJobId = await this.dbRecorder.agreementAcquired(
      ctx,
      getJobId(ctx),
      rental.agreement,
    );
    ctx = withJobProviderID(ctx, provJobId);

    try {
      await this.initEstimatorForRental(rental, generationParams);
      /*console.log(
        `🔨 Acquired provider ${providerName} from the pool, running the generation command on them ...`,
      );*/
      r = await this.runCommand(ctx, rental, generationParams);

      // TODO: should throw an error if the resuts failed verficication
      this.processCommandResult(ctx, r, generationParams);

      if (this.isWorkStopped()) {
        ctx.L().info("Work was stopped by user");
        await this.rentalPool.release(rental);
        return r;
      }

      ctx.L().info("Command finished successfully");
      shouldKeepRental = true;
    } catch (error) {
      ctx.L().error("Error during command execution:", error);
      wasSuccess = false;
      shouldKeepRental = await onError({
        error: isNativeError(error) ? error : new Error(String(error)),
        provider: rental.agreement.provider,
      }).catch((error) => {
        ctx
          .L()
          .warn(
            "Error in onError handler (defaulting to destroying rental):",
            error,
          );
        return false; // Default to destroying rental on error
      });
    }
    try {
      if (shouldKeepRental) {
        ctx.L().info(`Keeping rental with provider: ${providerName}`);
        /*console.log(
          `💡 Provider ${providerName} ran the command successfully, returning them to the pool of available workers`,
        );*/
        await this.rentalPool.release(rental);
      } else {
        ctx
          .L()
          .info(
            `Destroying rental with provider: ${providerName}, the provider failed to run the commmand`,
          );
        ctx.consoleInfo(
          `💔 Provider ${providerName} did not run the command successfully, destroying the rental`,
        );
        await this.rentalPool.destroy(rental);
      }
    } catch (error) {
      ctx
        .L()
        .error(
          `Error during rental for ${providerName} release/destroy:`,
          error,
        );
      throw new Error("Rental release/destroy failed");
    }
    if (!wasSuccess) {
      throw new Error(
        "Rental did not complete successfully, check logs for details",
      );
    }
    return r;
  }

  private async initEstimatorForRental(
    rental: ResourceRental,
    generationParams: GenerationParams,
  ) {
    await this.estimatorService.initJobIfNotInitialized(
      rental.agreement.id,
      rental.agreement.provider.name,
      rental.agreement.provider.id,
      computePrefixDifficulty(
        generationParams.vanityAddressPrefix.fullPrefix(),
      ),
    );
  }

  private processCommandResult(
    ctx: AppContext,
    cmd: CommandResult,
    generationParams: GenerationParams,
  ): void {
    // TODO: inform estimator that there were no results
    if (cmd.results.length === 0) {
      ctx.L().info("No results found in the command output");
      return;
    }

    for (const r in cmd.results) {
      // TODO: validation
      const addr = cmd.results[r].address;

      const entry: ProofEntryResult = {
        addr: addr,
        salt: cmd.results[r].salt,
        pubKey: cmd.results[r].pubKey,
        provider: cmd.provider,
        jobId: cmd.agreementId,
        cpu: cmd.providerType,
      };

      const isValid = validateVanityResult(ctx, cmd.results[r]);

      if (!isValid.isValid) {
        this.dbRecorder.resultInvalidVanityKey(ctx, getJobProviderID(ctx));
        ctx
          .L()
          .error(
            `Validation failed for result (provider ${cmd.provider.id}) ${cmd.results[r]}: ${isValid.msg}`,
          );
        throw new Error(
          `Validation failed for result (provider ${cmd.provider.id}) ${cmd.results[r]}: ${isValid.msg}`,
        );
      }

      //TODO reputation - recognize which patterns a given result matches (1)
      const matched = validateAddressMatchPattern(
        cmd.results[r].address,
        generationParams.vanityAddressPrefix.fullPrefix(),
      );

      // (1) if we have info about the pattern for the result
      // we can use it to write the right proof
      this.dbRecorder.proofsStore(ctx, getJobProviderID(ctx), [cmd.results[r]]);
      this.estimatorService.pushProofToQueue(entry);

      if (matched) {
        this.resultService.processValidatedEntry(
          entry,
          (jobId: string, address: string, addrDifficulty: number) => {
            ctx.consoleInfo(
              `Found address: ${entry.jobId}: ${entry.addr} diff: ${displayDifficulty(addrDifficulty)}`,
            );
          },
        );
      }
      ctx.L().debug("Found address:", addr);
    }
  }

  public isRequestedPattern(
    result: VanityResult,
    generationParams: GenerationParams,
  ): boolean {
    const pattern = generationParams.vanityAddressPrefix.fullPrefix();
    if (result.address.startsWith(pattern)) {
      return true;
    }
    return false;
  }

  public async disconnectFromGolemNetwork(ctx: AppContext): Promise<void> {
    if (!this.golemNetwork) {
      ctx.L().warn("Golem Network is not initialized, nothing to disconnect");
      return;
    }

    if (this.allocation) {
      try {
        await this.golemNetwork.payment.releaseAllocation(this.allocation);
        ctx.L().info("Released allocation");
        //  error here shouldn't prevent the other cleanup steps from running
      } catch (error) {
        ctx.L().error("Failed to release allocation:", error);
      }
    }

    try {
      await this.golemNetwork.disconnect();
      this.golemNetwork.market.events.removeAllListeners();
      ctx.L().info("Disconnected from Golem Network successfully");
      this.golemNetwork = undefined;
    } catch (error) {
      ctx.L().error("Failed to disconnect from Golem Network:", error);
      throw new Error("Disconnection from Golem Network failed");
    }
  }

  public async drainPool(
    ctx: AppContext,
    timeoutSeconds: number = 10,
  ): Promise<void> {
    if (!this.rentalPool) {
      ctx.L().warn("Rental pool is not initialized, nothing to drain");
      return;
    }
    try {
      ctx.L().info("Draining and clearing all rentals from the pool...");
      await withTimeout(this.rentalPool.drainAndClear(), timeoutSeconds * 1000);
      ctx.L().info("All rentals cleared from the pool");
    } catch (error) {
      ctx.L().error("Critical error during pool cleanup:", error);
      throw new Error("Failed to drain rental pool");
    }
  }
}
