// External imports
import {
  type Allocation,
  anyAbortSignal,
  type DraftOfferProposalPool,
  GolemNetwork,
  type ResourceRental,
  type ResourceRentalPool,
} from "@golem-sdk/golem-js";

// Internal imports
import { type AppContext, getJobId } from "../app_context";
import { type GenerationParams, ProcessingUnitType } from "../params";
import {
  type BaseRentalConfig,
  CPURentalConfig,
  GPURentalConfig,
} from "./config";
import {
  computePrefixDifficulty,
  computeSuffixDifficulty,
} from "../difficulty";
import type { EstimatorService } from "../estimator_service";
import type { ResultsService } from "../results_service";
import { VanityPaymentModule } from "./payment_module";
import {
  parseVanityResults,
  type IterationInfo,
  type ParsedResults,
  type CommandResult,
  VanityResultMatchingProblem,
} from "./result";
import { ProofEntryResult } from "../estimator/proof";
import { displayDifficulty } from "../utils/format";
import { validateVanityResult } from "../validator";

import {
  type GolemSessionRecorder,
  type Reputation,
  getProviderJobId,
  withProviderJobID,
} from "./types";
import { ProviderJobModel } from "../lib/db/schema";
import { JobUploaderService } from "./job_uploader";

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

  reputation: Reputation;

  resultService: ResultsService;
}

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
  private jobUploaderService: JobUploaderService | null;
  private reputation: Reputation;
  private resultService: ResultsService;
  private stopWorkAC: AbortController = new AbortController();
  private dbRecorder: GolemSessionRecorder;

  constructor(
    params: SessionManagerParams,
    recorder: GolemSessionRecorder,
    jobUploader: JobUploaderService | null,
  ) {
    this.rentalDurationSeconds = params.rentalDurationSeconds;
    this.budgetInitial = params.budgetInitial;
    this.processingUnitType = params.processingUnitType;
    this.estimatorService = params.estimatorService;
    this.reputation = params.reputation;
    this.resultService = params.resultService;
    this.dbRecorder = recorder;
    this.jobUploaderService = jobUploader;
  }

  public async saveResultsToFile(filePath: string): Promise<void> {
    await this.resultService.saveResultsToFile(filePath);
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
      market: {
        demandRefreshIntervalSec: 60 * 5, // refresh demand every 5 minutes to get fresh offers
      },
    });
    try {
      await this.golemNetwork.connect();
      ctx.info("Connected to Golem Network successfully");
    } catch (error) {
      ctx.error(`Failed to connect to Golem Network: ${error}`);
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

  public getConfigBasedOnProcessingUnitType(): BaseRentalConfig {
    switch (this.processingUnitType) {
      case ProcessingUnitType.CPU:
        return new CPURentalConfig();
      case ProcessingUnitType.GPU:
        return new GPURentalConfig();
      default:
        throw new Error(
          `Unsupported processing unit type: ${this.processingUnitType}`,
        );
    }
  }

  public async initializeRentalPool(ctx: AppContext): Promise<void> {
    if (!this.golemNetwork) {
      ctx.error(
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

    // Periodically remove stale offers from the proposal pool
    this.golemNetwork.market.events.on("demandSubscriptionRefreshed", () => {
      ctx.info(
        "Demand subscription refreshed, removing stale offers from pool...",
      );
      const proposalPool = this.rentalPool?.getProposalPool();
      if (!proposalPool) {
        ctx.warn("Tried removing stale offers but proposal pool was not found");
        return;
      }
      proposalPool.getAvailable().forEach((offer) => {
        const timestamp10MinsAgo = new Date(
          Date.now() - 10 * 60 * 1000,
        ).toISOString();
        if (offer.timestamp.toISOString() < timestamp10MinsAgo) {
          proposalPool.remove(offer);
          ctx.debug(
            `Proposal ${offer.id} removed from pool, reason: stale (over 10 minutes old)`,
          );
        }
      });
      ctx.info(
        `Successfully removed stale proposals from the pool, remaining size: ${proposalPool.availableCount()}`,
      );
    });

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
          ctx,
          this.rentalDurationSeconds,
          this.allocation,
          this.reputation,
        ),
      });
    } catch (error) {
      ctx.error(`Failed to initialize rental pool: ${error}`);
      throw error;
    }
  }

  public async waitForEnoughOffers(
    ctx: AppContext,
    numOffers: number,
    timeoutSec: number,
  ): Promise<void> {
    if (!this.rentalPool) {
      ctx.error(
        "Rental pool is not initialized. Call initializeRentalPool first.",
      );
      throw new Error("Rental pool is not initialized");
    }
    const proposalPool: DraftOfferProposalPool =
      this.rentalPool["proposalPool"];
    const isEnough = () => proposalPool.availableCount() >= numOffers;

    if (isEnough()) {
      ctx.info(
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
          ctx.info(
            `Found enough offers: ${proposalPool.availableCount()} >= ${numOffers}`,
          );
          cleanup();
          resolve();
          return;
        }
        ctx.info(
          `Current offers: ${proposalPool.availableCount()}, waiting for ${numOffers} offers...`,
        );
      };
      const timeoutId = setTimeout(() => {
        cleanup();
        ctx.warn(
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

      ctx.info(
        `Exe unit ready, running capability check: ${provider.name}, type: ${this.processingUnitType}`,
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

      if (this.processingUnitType === ProcessingUnitType.CPU) {
        ctx.info(`Capabilities checked, ${config["_config"].cpuCount}`);
      }

      const command = config.generateCommand(generationParams);

      //TODO Reputation
      //is that the best place?

      await this.dbRecorder.providerJobStarted(ctx, getProviderJobId(ctx));

      ctx.info(`Executing command: ${command}`);
      const startTime = Date.now();
      const commandExecutionSec = generationParams.singlePassSeconds;
      const timeoutBufferSec =
        Number(process.env.COMMAND_EXECUTION_TIMEOUT_BUFFER) || 30_000; // buffer for command execution timeout
      //FIXME: sleep 1 as a workaround for yagna stdout truncate issue, remove when resolved
      // https://github.com/golemfactory/yagna/issues/3450
      const res = await exe.run(`${command} && sleep 1`, {
        signalOrTimeout: anyAbortSignal(
          this.stopWorkAC.signal,
          AbortSignal.timeout(commandExecutionSec * 1000 + timeoutBufferSec), // timeout = expected time to execute command + buffer
        ).signal,
      });
      ctx.info(
        `Command finished after ${((Date.now() - startTime) / 1000).toFixed(1)} s`,
      );

      /* Uncomment this code to parse reported compute stats
      let biggestCompute = 0;
      const stderr = res.stderr ? String(res.stderr) : "";
      for (const line of stderr.split("\n")) {
        //ctx.info(line);
        if (line.includes("Total compute")) {
          try {
            const totalCompute = line
              .split("Total compute ")[1]
              .trim()
              .split(" GH")[0];
            const totalComputeFloatGh = parseFloat(totalCompute);
            biggestCompute = totalComputeFloatGh * 1e9;
          } catch (e) {
            ctx.error("Error parsing compute stats:", e);
          }
        }
      }

       */
      await this.dbRecorder.providerJobCompleted(ctx, getProviderJobId(ctx));

      const stdout = res.stdout ? String(res.stdout) : "";

      const parsedResults: ParsedResults = parseVanityResults(
        ctx,
        stdout.split("\n"),
        generationParams.problems,
        this.processingUnitType,
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

      /*
      // we cannot be sure that all lines will be parsed correctly
      if (cmdResult.failedLines.length > 1) {
        //TODO reputation
        // push proofs to table
        // if some failed to parse, set offense to nonsense
        await this.dbRecorder.resultFailedParsing(ctx, getProviderJobId(ctx));

        ctx.error(`failed to parse lines: ${cmdResult.failedLines}`);
        throw new Error("Failed to parse result lines");
      }

       */

      if (cmdResult.results.length === 0) {
        // TODO: inform estimator and reputation model
        ctx.info("No results found in the output");
        cmdResult.status = "not_found";
        return cmdResult;
      }
      ctx.info(
        `Found ${cmdResult.results.length} results for job ${agreementId}`,
      );
      return cmdResult;
    } catch (error) {
      if (this.stopWorkAC.signal.aborted) {
        ctx.L().info("Work was stopped by user");
        await this.dbRecorder.providerJobStopped(ctx, getProviderJobId(ctx));
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
      await this.dbRecorder.providerJobFailed(
        ctx,
        getProviderJobId(ctx),
        String(error),
      );

      throw new Error(`Profanity execution failed`);
    }
  }

  public getProposals(): object {
    const rentalPool = this.rentalPool;
    if (!rentalPool) {
      return {};
    }
    return rentalPool.getProposalPool().getAvailable();
  }

  public getRentalStatus() {
    const rentalPool = this.rentalPool;
    if (!rentalPool) {
      return {};
    }
    const idleRentalsWithActivity: Set<ResourceRental> =
      rentalPool["highPriority"];
    const idleRentalsWithNoActivity: Set<ResourceRental> =
      rentalPool["lowPriority"];
    const activeRentals: Set<ResourceRental> = rentalPool["borrowed"];

    return {
      activeRentals: Array.from(activeRentals).map((rental) => ({
        provider: rental.agreement.provider.name,
        agreementId: rental.agreement.id,
        status: "active",
      })),
      highPriority: Array.from(idleRentalsWithActivity).map((rental) => ({
        provider: rental.agreement.provider.name,
        agreementId: rental.agreement.id,
        status: "idle_with_activity",
      })),
      borrowed: Array.from(idleRentalsWithNoActivity).map((rental) => ({
        provider: rental.agreement.provider.name,
        agreementId: rental.agreement.id,
        status: "idle_with_no_activity",
      })),
    };
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
  ): Promise<IterationInfo | null> {
    if (this.stopWorkAC.signal.aborted) {
      ctx.info("Work was stopped by user");
      return null;
    }
    if (!this.golemNetwork || !this.allocation || !this.rentalPool) {
      ctx.error(
        "Cannot run command without initialized Golem Network, allocation and rental pool.",
      );
      throw new Error(
        "Golem Network, allocation or rental pool is not initialized",
      );
    }

    let wasSuccess = true;

    const rental = await this.rentalPool.acquire(this.stopWorkAC.signal); // wait as long as needed to find a provider (cancelled by stopWorkAC)

    await this.dbRecorder.agreementCreate(ctx, getJobId(ctx), rental.agreement);

    const providerName = rental.agreement.provider.name;

    ctx.info(`Checking if terminate rental with provider: ${providerName}`);
    if (
      this.estimatorService.checkIfTerminate(ctx, rental.agreement.id, null)
    ) {
      ctx.warn(
        `Terminating rental with provider ${providerName} due to estimator decision`,
      );
      this.reputation.ban(ctx, rental.agreement.provider.id, "low performance");
      await this.rentalPool.destroy(rental, 60_000);
      return null; // No results, rental was terminated
    }

    let shouldKeepRental: boolean;
    let cmdResult: CommandResult | null = null;

    // TODO Reputation select additional problems for hashrateverification
    const providerJobId = await this.dbRecorder.providerJobCreate(
      ctx,
      getJobId(ctx),
      rental.agreement,
    );
    ctx = withProviderJobID(ctx, providerJobId);

    try {
      await this.initEstimatorForRental(rental, generationParams);
      await this.initJobUploaderForRental(rental);

      ctx.info(`Running command on provider: ${providerName}`);
      cmdResult = await this.runCommand(ctx, rental, generationParams);

      ctx.info(`Command finished, processing results...`);

      // TODO: should throw an error if the results failed verification

      await this.processCommandResult(ctx, cmdResult, generationParams);
      ctx.info(`Processing results completed`);

      await this.estimatorService.process(rental.agreement.id);

      //don't have to await this, it can be processed in the background
      this.jobUploaderService?.process(rental.agreement.id).catch((error) => {
        ctx.error(
          `Error during job uploader processing for agreement ${rental.agreement.id}: ${error}`,
        );
      });

      await this.storeHashRate(ctx, providerJobId, rental.agreement.id);

      if (this.isWorkStopped()) {
        ctx.info(`Work was stopped by user, releasing rental`);
        await this.rentalPool.release(
          rental,
          AbortSignal.timeout(
            Number(process.env.RENTAL_RELEASE_TIMEOUT) || 30_000,
          ),
        );
        ctx.info(`Work was stopped by user, rental released`);
        return cmdResult;
      }

      ctx.info(`Command executed successfully on provider: ${providerName}`);
      shouldKeepRental = true;
    } catch (error) {
      ctx.error(`Error during command execution: ${error}`);
      wasSuccess = false;
      shouldKeepRental = false;
    }
    try {
      if (shouldKeepRental) {
        ctx.info(`Releasing rental to the pool...`);
        await this.rentalPool.release(
          rental,
          AbortSignal.timeout(
            Number(process.env.RENTAL_RELEASE_TIMEOUT) || 30_000,
          ),
        );
        ctx.info(`Rental released`);
      } else {
        ctx.info(
          `Destroying rental with provider: ${providerName}, the provider failed to run the command`,
        );
        ctx.consoleInfo(
          `💔 Provider ${providerName} did not run the command successfully, destroying the rental`,
        );
        this.reputation.ban(
          ctx,
          rental.agreement.provider.id,
          "failed to run command",
        );
        await this.rentalPool.destroy(
          rental,
          AbortSignal.timeout(
            Number(process.env.RENTAL_DESTROY_TIMEOUT) || 30_000,
          ),
        );
        ctx.info(
          `Successfully destroyed rental with provider: ${providerName}`,
        );
      }
    } catch (error) {
      ctx.error(
        `Error during rental for ${providerName} release/destroy: ${error}`,
      );
      throw new Error("Rental release/destroy failed");
    }
    if (!wasSuccess) {
      throw new Error(
        "Rental did not complete successfully, check logs for details",
      );
    }
    return cmdResult;
  }

  private async storeHashRate(
    ctx: AppContext,
    providerJobId: string,
    agreementId: string,
  ) {
    const providerJobs: ProviderJobModel[] =
      await this.dbRecorder.getProviderJob(ctx, providerJobId);
    const providerJob = providerJobs[0];
    if (providerJob.endTime) {
      const providerJobStartTime = new Date(providerJob.startTime);
      const providerJobEndTime = new Date(providerJob.endTime);
      const providerJobSeconds =
        (providerJobEndTime.getTime() - providerJobStartTime.getTime()) / 1000;
      const speedEstimation = this.estimatorService
        .getEstimator(agreementId)
        .estimatedSpeedSingleRun(providerJobSeconds);
      return this.dbRecorder.addHashRate(
        ctx,
        providerJobId,
        speedEstimation.speed,
      );
    }
  }

  private async initEstimatorForRental(
    rental: ResourceRental,
    generationParams: GenerationParams,
  ) {
    await this.estimatorService.initJobIfNotInitialized(
      rental.agreement.id,
      rental.agreement.provider.name,
      rental.agreement.provider.id,
      rental.agreement.provider.walletAddress,
      computePrefixDifficulty(
        generationParams.problems.find((p) => p.type === "user-prefix")
          ?.specifier || "",
      ) +
        computeSuffixDifficulty(
          generationParams.problems.find((p) => p.type === "user-suffix")
            ?.specifier || "",
        ),
    );
  }

  private async initJobUploaderForRental(rental: ResourceRental) {
    await this.jobUploaderService?.initJobIfNotInitialized(
      rental.agreement.id,
      rental.agreement.provider.name,
      rental.agreement.provider.id,
      rental.agreement.provider.walletAddress,
    );
  }

  //@todo get rid of async
  private async processCommandResult(
    ctx: AppContext,
    cmd: CommandResult,
    generationParams: GenerationParams,
  ): Promise<void> {
    if (cmd.results.length === 0) {
      ctx.info("No results found in the command output");
      this.estimatorService.reportEmpty(getProviderJobId(ctx));
      return;
    }

    for (const result of cmd.results) {
      // TODO: validation
      const addr = result.address;

      const entry: ProofEntryResult = {
        addr: addr,
        salt: result.salt,
        pubKey: result.pubKey,
        provider: cmd.provider,
        jobId: cmd.agreementId,
        workDone: result.workDone,
      };

      const isValid = validateVanityResult(ctx, result);

      if (!isValid.isValid) {
        await this.dbRecorder.resultInvalidVanityKey(
          ctx,
          getProviderJobId(ctx),
        );
        ctx
          .L()
          .error(
            `Validation failed for result (provider ${cmd.provider.id}) ${result}: ${isValid.msg}`,
          );
        throw new Error(
          `Validation failed for result (provider ${cmd.provider.id}) ${result}: ${isValid.msg}`,
        );
      }

      // if the result matches any problems we save it
      if (result.problem) {
        await this.dbRecorder.proofsStore(ctx, getProviderJobId(ctx), [
          result as VanityResultMatchingProblem,
        ]);
        this.estimatorService.pushProofToQueue(entry);
        this.jobUploaderService?.pushProofToQueue(entry);
      }

      if (this.isRequestedPattern(entry.addr, generationParams)) {
        this.resultService.processValidatedEntry(
          entry,
          (jobId: string, address: string, addrDifficulty: number) => {
            ctx.consoleInfo(
              `Found address: ${entry.jobId}: ${entry.addr} diff: ${displayDifficulty(addrDifficulty)}`,
            );
          },
        );
      }
      ctx.debug(`Found address: ${addr}`);
    }
  }

  public isRequestedPattern(
    address: string,
    generationParams: GenerationParams,
  ): boolean {
    const prefixProblem = generationParams.problems.find(
      (p) => p.type === "user-prefix",
    );
    const suffixProblem = generationParams.problems.find(
      (p) => p.type === "user-suffix",
    );
    if (prefixProblem && address.startsWith(prefixProblem.specifier)) {
      return true;
    }
    if (suffixProblem && address.endsWith(suffixProblem.specifier)) {
      return true;
    }
    return false;
  }

  public async disconnectFromGolemNetwork(ctx: AppContext): Promise<void> {
    if (!this.golemNetwork) {
      ctx.warn("Golem Network is not initialized, nothing to disconnect");
      return;
    }

    if (this.allocation) {
      try {
        await this.golemNetwork.payment.releaseAllocation(this.allocation);
        ctx.info("Released allocation");
        //  error here shouldn't prevent the other cleanup steps from running
      } catch (error) {
        ctx.error(`Failed to release allocation: ${error}`);
      }
    }

    try {
      await this.golemNetwork.disconnect();
      this.golemNetwork.market.events.removeAllListeners();
      ctx.info("Disconnected from Golem Network successfully");
      this.golemNetwork = undefined;
    } catch (error) {
      ctx.error(`Failed to disconnect from Golem Network: ${error}`);
      throw new Error("Disconnection from Golem Network failed");
    }
  }

  public async drainPool(
    ctx: AppContext,
    timeoutSeconds: number = 30,
  ): Promise<void> {
    if (!this.rentalPool) {
      ctx.warn("Rental pool is not initialized, nothing to drain");
      return;
    }
    try {
      ctx.info("Draining and clearing all rentals from the pool...");
      await this.rentalPool.drainAndClear(timeoutSeconds * 1000);
      ctx.info("All rentals cleared from the pool");
    } catch (error) {
      ctx.error(`Critical error during pool cleanup: ${error}`);
      throw new Error("Failed to drain rental pool");
    }
  }
}
