// Don't import anything before it!
import { shutdownOpenTelemetry } from "./instrumentation";
import { trace, metrics } from "@opentelemetry/api";
import { MetricsCollector } from "./metrics_collector";
import { AppContext, getPinoLoggerWithOtel } from "./app_context";
import { Command } from "commander";
import { Scheduler } from "./scheduler";
import { GenerationParams, ProcessingUnitType } from "./params";
import {
  GenerateCmdOptions,
  validateGenerateOptions,
  readPublicKeyFromFile,
} from "./app/optionsValidator";
import {
  GolemSessionManager,
  SessionManagerParams,
} from "./node_manager/golem_session";

import process from "process";
import { ROOT_CONTEXT } from "@opentelemetry/api";
import { computePrefixDifficulty } from "./difficulty";
import { displayDifficulty, displayTime } from "./utils/format";
import { sleep } from "@golem-sdk/golem-js";
import "dotenv/config";
import { EstimatorService } from "./estimator_service";
import { ResultsService } from "./results_service";
import { APP_NAME, APP_VERSION } from "./version";
import { drizzle } from "drizzle-orm/libsql";
import { GollemSessionRecorderImpl } from "./db/golem_session_recorder";
import { SchedulerRecorderImpl } from "./db/scheduler_recorder";
import { SchedulerRecorder } from "./scheduler/types";
import { ReputationImpl } from "./reputation/reputation";

/**
 * Handles the generate command execution with proper validation and error handling
 * @param options - Command options from commander.js
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateCommand(options: any): Promise<void> {
  const logger = getPinoLoggerWithOtel(
    APP_NAME,
    process.env.OTEL_LOG_LEVEL || "info",
  );

  const tracer = trace.getTracer(APP_NAME, APP_VERSION);
  const meter = metrics.getMeter(APP_NAME, APP_VERSION);
  const mCollector = MetricsCollector.newCollector(meter);
  const db = drizzle(`file:${options.db}`);

  const appCtx = new AppContext(ROOT_CONTEXT)
    .WithLogger(logger)
    .WithTracer(tracer)
    .WithCollector(mCollector)
    .WithDatabase(db);

  let golemSessionManager: GolemSessionManager | null = null;
  let isShuttingDown = false;
  const gracefulShutdown = async (exitCode: number) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    console.log("\nGracefully shutting down...");

    if (golemSessionManager) {
      // first stop the generation process if it's still running
      try {
        golemSessionManager.stopWork("User initiated shutdown");
        appCtx.consoleInfo("✅ Generation process stopped successfully");
      } catch (error) {
        appCtx.L().error("❌ Error stopping generation process:", error);
      }

      if (options.resultsFile) {
        try {
          await golemSessionManager.saveResultsToFile(options.resultsFile);
          appCtx.consoleInfo(
            `✅ Results saved to file: ${options.resultsFile}`,
          );
        } catch (error) {
          appCtx.L().error(`❌ Error saving results to file: ${error}`);
        }
      }

      // then clean up rentals (which gives us the chance to pay for the work done)
      try {
        await golemSessionManager.drainPool(appCtx);
        appCtx.consoleInfo("✅ All rentals cleaned up successfully");
      } catch (error) {
        appCtx.L().error("❌ Error during rental cleanup:", error);
      }

      // only then we can safely disconnect from the Golem network and release the allocation
      try {
        await golemSessionManager.disconnectFromGolemNetwork(appCtx);
        appCtx.consoleInfo("✅ Disconnected from Golem network");
      } catch (disconnectError) {
        appCtx
          .L()
          .error("❌ Error disconnecting from Golem network:", disconnectError);
      }
    }

    // and shut down OpenTelemetry
    try {
      await shutdownOpenTelemetry();
      appCtx.consoleInfo("✅ OpenTelemetry shut down successfully");
    } catch (err) {
      console.info("❌ Error shutting down OpenTelemetry", err);
    }

    process.exit(exitCode);
  };

  // Register signal handlers to initiate graceful shutdown
  process.on("SIGINT", () => gracefulShutdown(0));
  process.on("SIGTERM", () => gracefulShutdown(0));

  try {
    const publicKey = readPublicKeyFromFile(options.publicKey);

    const generateOptions: GenerateCmdOptions = {
      publicKey: publicKey,
      publicKeyPath: options.publicKey,
      vanityAddressPrefix: options.vanityAddressPrefix,
      budgetInitial: options.budgetInitial,
      budgetLimit: options.budgetLimit,
      budgetTopUp: options.budgetTopUp,
      resultsFile: options.resultsFile,
      processingUnit: options.processingUnit,
      numResults: BigInt(options.numResults),
      numWorkers: parseInt(options.numWorkers),
      nonInteractive: options.nonInteractive,
      minOffers: parseInt(options.minOffers),
      minOffersTimeoutSec: parseInt(options.minOffersTimeoutSec),
      dbPath: options.db,
    };

    const validatedOptions = validateGenerateOptions(generateOptions);

    appCtx.consoleInfo(
      "🚀 Starting vanity address generation with the following parameters:\n" +
        `   Public Key File: ${generateOptions.publicKeyPath}\n` +
        `   Public Key: ${validatedOptions.publicKey.toHex()}\n` +
        `   Vanity Address Prefix: ${validatedOptions.vanityAddressPrefix.fullPrefix()}\n` +
        `   Budget Limit: ${validatedOptions.budgetLimit}\n` +
        `   Worker Type: ${validatedOptions.processingUnitType}\n\n` +
        `✓ All parameters validated successfully\n` +
        `✓ OpenTelemetry tracing enabled for generation process\n`,
    );

    const difficulty = computePrefixDifficulty(
      validatedOptions.vanityAddressPrefix.fullPrefix(),
    );
    const estimatedSecondsToFindOneAddress =
      validatedOptions.processingUnitType === ProcessingUnitType.CPU
        ? difficulty / 10000000
        : difficulty / 250000000;

    appCtx.consoleInfo(
      `Difficulty of the prefix: ${displayDifficulty(difficulty)}`,
    );
    if (validatedOptions.processingUnitType === ProcessingUnitType.GPU) {
      appCtx.consoleInfo(
        `Using GPU worker type. Estimated time on a single Nvidia 3060: ${displayTime("GPU ", estimatedSecondsToFindOneAddress)}`,
      );
    } else {
      appCtx.consoleInfo(
        `Using CPU worker type. Estimated time: ${displayTime("CPU ", estimatedSecondsToFindOneAddress)}`,
      );
    }
    if (!generateOptions.nonInteractive) {
      appCtx.consoleInfo("Continue in 10 seconds... Press Ctrl+C to cancel");
      await sleep(10);
    }

    const generationParams: GenerationParams = {
      publicKey: validatedOptions.publicKey.toTruncatedHex(),
      vanityAddressPrefix: validatedOptions.vanityAddressPrefix,
      budgetInitial: validatedOptions.budgetInitial,
      budgetTopUp: validatedOptions.budgetTopUp,
      budgetLimit: validatedOptions.budgetLimit,
      numberOfWorkers: parseInt(options.numWorkers),
      singlePassSeconds: options.singlePassSec
        ? parseInt(options.singlePassSec)
        : 20, // Default single pass duration
      numResults: options.numResults,
      problems: [
        {
          type: "user-prefix",
          specifier: validatedOptions.vanityAddressPrefix.fullPrefix(),
        },
        { type: "leading-any" },
        { type: "trailing-any" },
        { type: "letters-heavy" },
        { type: "numbers-heavy" },
        { type: "snake-score-no-case" },
      ],
    };

    const formatDateForFilename = (date = new Date()) => {
      return date
        .toISOString()
        .slice(0, 19)
        .replace(/:/g, "-")
        .replace("T", "_");
    };
    const resultService = new ResultsService(appCtx, {
      vanityPrefix: validatedOptions.vanityAddressPrefix,
      //location of the file that saves all results
      csvOutput:
        process.env.RESULT_CSV_FILE || `results-${formatDateForFilename()}.csv`,
    });

    const reputation = new ReputationImpl();

    const estimatorService = new EstimatorService(appCtx, {
      vanityPrefix: validatedOptions.vanityAddressPrefix,
      messageLoopSecs: parseFloat(
        process.env.MESSAGE_LOOP_SEC_INTERVAL || "30.0",
      ),
      processLoopSecs: parseFloat(
        process.env.PROCESS_LOOP_SEC_INTERVAL || "1.0",
      ),
      resultService,
    });
    const sessionManagerParams: SessionManagerParams = {
      rentalDurationSeconds: 15 * 60, // for all cost calculations assume we're renting a provider for 15 minutes at a time
      budgetInitial: generationParams.budgetInitial,
      processingUnitType: validatedOptions.processingUnitType,
      estimatorService,
      reputation,
      resultService,
    };

    const dbRecorder: GollemSessionRecorderImpl =
      new GollemSessionRecorderImpl();
    golemSessionManager = new GolemSessionManager(
      sessionManagerParams,
      dbRecorder,
    );

    await golemSessionManager.connectToGolemNetwork(appCtx);
    appCtx.consoleInfo("✅ Connected to Golem network successfully");

    await golemSessionManager.initializeRentalPool(appCtx);
    appCtx.consoleInfo(
      `✅ Initialized pool of ${generationParams.numberOfWorkers} rentals`,
    );

    appCtx.consoleInfo(
      `🔍 Looking for the best offer (waiting for at least ${generateOptions.minOffers} proposals with a ${generateOptions.minOffersTimeoutSec} second timeout)`,
    );
    await golemSessionManager.waitForEnoughOffers(
      appCtx,
      generateOptions.minOffers,
      generateOptions.minOffersTimeoutSec,
    );

    const schedulerRecorder: SchedulerRecorder = new SchedulerRecorderImpl();
    const scheduler = new Scheduler(
      golemSessionManager,
      estimatorService,
      schedulerRecorder,
    );
    await scheduler.runGenerationProcess(appCtx, generationParams);

    // Normal completion, initiate shutdown.
    await gracefulShutdown(0);
  } catch (error) {
    // Avoid logging error if shutdown was user-initiated via Ctrl+C
    if (!isShuttingDown) {
      appCtx.consoleError("❌ Failed during execution:", error);
    }
    await gracefulShutdown(1);
  }
}

/**
 * Main CLI application entry point
 * Implements generate command with comprehensive validation
 * Following TDD principles and professional development standards
 */
function main(): void {
  // Create CLI program using commander.js with proper configuration
  const program = new Command();

  program
    .name(APP_NAME)
    .description("Vanity address generator CLI with OpenTelemetry support")
    .version(APP_VERSION);

  // Generate command - Step 2 implementation
  program
    .command("generate")
    .description("Generate vanity addresses with specified parameters")
    .requiredOption(
      "--public-key <path>",
      "Path to file containing the public key",
    )
    .requiredOption(
      "--vanity-address-prefix <prefix>",
      "Desired vanity prefix for the generated address",
    )
    .option(
      "--single-pass-sec <singlePassSec>",
      "How long single pass should take in seconds (default: 20)",
    )
    .option(
      "--results-file <file>",
      "Path to save the generation results (default: golem_results.json)",
    )
    .option(
      "--processing-unit <type>",
      "Processing unit to use: 'cpu' or 'gpu' (default: gpu)",
    )
    .option(
      "--num-results <numResults>",
      "Number of vanity addresses to find (default: 1)",
      "1", // Default value
    )
    .option(
      "--num-workers <numWorkers>",
      "Number of workers to allocate (default: 1)",
      "1", // Default value
    )
    .option(
      "--non-interactive",
      "Run in non-interactive mode without prompts",
      false, // Default to false
    )
    .option(
      "--min-offers <minOffers>",
      "Minimum number of offers to wait for before starting (default: 5)",
      "5", // Default value
    )
    .option(
      "--min-offers-timeout-sec <minOffersTimeoutSec>",
      "Timeout in seconds for waiting for enough offers (default: 30)",
      "30", // Default value
    )
    .option(
      "--budget-initial <budgetInitial>",
      "The initial GLM amount for the payment allocation. This is topped up as needed, up to the budget limit.",
      "1",
    )
    .option(
      "--budget-top-up <budgetTopUp>",
      "The amount in GLM to add to the allocation when its balance runs low. This incremental funding helps manage spending.",
      "1",
    )
    .option(
      "--budget-limit <budgetLimit>",
      "The total budget cap in GLM for the entire generation process. Work stops when this limit is reached.",
    )
    .option("--db <dbPath>", "File to store data", "./db.sqlite")
    .action(handleGenerateCommand);

  // Parse command line arguments and execute appropriate command
  program.parse();
}

// Execute main function only when file is run directly (not imported)
if (require.main === module) {
  main();
}

// Export functions for comprehensive testing coverage
export { main };
