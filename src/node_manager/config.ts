/**
 * Configuration for CPU and GPU rentals
 */

import { GenerationParamsShort, ProcessingUnitType } from "../params";
import { ExeUnit, Allocation, MarketOrderSpec } from "@golem-sdk/golem-js";
import { filterProposal, selectBestProvider } from "./selector";
import { Reputation } from "./types";
import { AppContext } from "../app_context";
import { getErrorMessage, safeStringifyStdout } from "../utils/format";

/**
 * Configuration for a specific processing unit type
 */
export interface RentalConfig {
  /** CPU or GPU */
  type: ProcessingUnitType;

  /** Number of compute kernels to use */
  kernelCount: number;

  /** Number of work groups */
  groupCount: number;

  /** Number of rounds per execution */
  roundCount: number;

  /** Golem capabilities required for this processing unit type */
  capabilities: string[];

  /** Docker image tag to use */
  imageTag: string;

  /** Golem execution engine */
  engine: string;

  /** CPU count for parallel processing (CPU rentals only) */
  cpuCount?: number;

  /** Maximum price per hour in GLM tokens */
  maxEnvPricePerHour: number;

  /** Maximum price per CPU thread (CPU rentals only) - added to env price */
  maxCpuPerHourPrice?: number; // Maximum CPU price per hour in GLM tokens
}

export function getCruncherVersion() {
  return process.env.CRUNCHER_VER || "prod-12.4.1";
}

/**
 * Abstract base class for rental configurations
 */
export abstract class BaseRentalConfig {
  private _config: RentalConfig;

  constructor() {
    this._config = this.createConfig(getCruncherVersion());
  }

  /**
   * Get the configuration for this processing unit type
   */
  public get config(): RentalConfig {
    return { ...this._config };
  }

  protected updateConfigCpuCount(count: number) {
    if (count < 1 || count > 255) {
      throw new Error("CPU count must be between 1 and 255");
    }
    this._config.cpuCount = count;
  }

  /**
   * Create processing unit-specific configuration
   */
  protected abstract createConfig(cruncherVersion: string): RentalConfig;

  /**
   * Generate the command to execute profanity_cuda for this processing unit type
   */
  public abstract generateCommand(params: GenerationParamsShort): string;

  /**
   * Validate processing unit capabilities and update the relevant configuration internally.
   */
  public abstract checkAndSetCapabilities(exe: ExeUnit): Promise<void>;

  /**
   * Get the Golem order configuration for this processing unit type
   */
  public getOrder(
    ctx: AppContext,
    rentalDurationSeconds: number,
    allocation: Allocation,
    reputation: Reputation,
  ): MarketOrderSpec {
    const rentalDurationHours = Math.ceil(rentalDurationSeconds / 3600);

    return {
      demand: {
        workload: {
          imageTag: this._config.imageTag,
          capabilities: this._config.capabilities,
          engine: this._config.engine,
        },
      },
      market: {
        // 1 year is a safe default, expiration time is mandatory but we don't want the rental to expire on it's own
        rentHours: 24 * 365,
        pricing: {
          model: "linear",
          maxStartPrice: 0.0,
          maxCpuPerHourPrice: this._config.maxCpuPerHourPrice ?? 0.0,
          maxEnvPerHourPrice: this._config.maxEnvPricePerHour,
        },
        offerProposalFilter: filterProposal(ctx, reputation),
        offerProposalSelector: selectBestProvider(ctx, rentalDurationHours),
      },
      payment: {
        allocation,
      },
    };
  }

  /**
   * Get the processing unit type
   */
  public getType(): ProcessingUnitType {
    return this._config.type;
  }

  /**
   * Check if this configuration is for a CPU rental
   */
  public isCPU(): boolean {
    return this._config.type === ProcessingUnitType.CPU;
  }

  /**
   *  Check if this configuration is for a GPU rental
   */
  public isGPU(): boolean {
    return this._config.type === ProcessingUnitType.GPU;
  }
}

/**
 * CPU implementation for parallel processing
 */
export class CPURentalConfig extends BaseRentalConfig {
  protected createConfig(cruncherVersion: string): RentalConfig {
    return {
      type: ProcessingUnitType.CPU,
      kernelCount: 1,
      groupCount: 1,
      roundCount: 20000,
      capabilities: [], // Standard VM capabilities
      imageTag: `nvidia/cuda-x-crunch:${cruncherVersion}`,
      engine: "vm",
      cpuCount: 1, // Will be updated after detection
      maxEnvPricePerHour: parseFloat(process.env.MAX_CPU_ENV_PER_HOUR || "0.1"), // Default price per hour in GLM tokens
      maxCpuPerHourPrice: parseFloat(
        process.env.MAX_CPU_CPU_PER_HOUR || "0.01",
      ), // Default price per CPU thread in GLM tokens
    };
  }

  public async checkAndSetCapabilities(exe: ExeUnit): Promise<void> {
    try {
      const result = await exe.run("nproc");
      const cpuCount = parseInt(
        safeStringifyStdout(result.stdout || "").trim() || "1",
      );

      if (cpuCount < 1) {
        throw new Error("CPU count cannot be smaller than 1");
      }
      if (cpuCount > 255) {
        throw new Error("CPU count cannot be greater than 255");
      }

      this.updateConfigCpuCount(cpuCount);
    } catch (error) {
      throw new Error(
        `Failed to detect CPU capabilities: ${getErrorMessage(error)}`,
      );
    }
  }

  public generateCommand(params: GenerationParamsShort): string {
    const cpuCount = this.config.cpuCount || 1;
    const prefix = params.vanityAddressPrefix?.toArg() || "";
    const suffix = params.vanityAddressSuffix?.toArg() || "";
    const mask =
      params.problems.find((p) => p.type === "user-mask")?.specifier || "";

    const prefixCommand = prefix ? `prefix=${prefix}` : "";
    const suffixCommand = suffix ? `suffix=${suffix}` : "";
    const maskCommand = mask ? `mask=${mask}` : "";

    const commands = [prefixCommand, suffixCommand, maskCommand]
      .filter(Boolean)
      .join(";");

    // Create multiple prefix instances for parallel processing
    const patterns = ` "${commands}"`.repeat(cpuCount);

    const commandParts = [
      "parallel",
      "profanity_cuda",
      "--cpu",
      "-k",
      this.config.kernelCount.toString(),
      "-g",
      this.config.groupCount.toString(),
      "-r",
      this.config.roundCount.toString(),
      "-b",
      params.singlePassSeconds.toString(),
      "-z",
      params.publicKey,
      "-p",
      "{}",
      `:::${patterns}`,
    ];

    return commandParts.join(" ");
  }
}

/**
 * GPU implementation for CUDA processing
 */
export class GPURentalConfig extends BaseRentalConfig {
  protected createConfig(cruncherVersion: string): RentalConfig {
    return {
      type: ProcessingUnitType.GPU,
      kernelCount: 64,
      groupCount: 1000,
      roundCount: 1000,
      capabilities: ["!exp:gpu"],
      imageTag: `nvidia/cuda-x-crunch:${cruncherVersion}`,
      engine: "vm-nvidia",
      maxCpuPerHourPrice: 0.0,
      maxEnvPricePerHour: parseFloat(process.env.MAX_GPU_ENV_PER_HOUR || "2.0"),
    };
  }

  public async checkAndSetCapabilities(_exe: ExeUnit): Promise<void> {
    try {
      //don't waste time on unused command
      //await exe.run("nvidia-smi");
    } catch (error) {
      throw new Error(
        `Failed to validate GPU capabilities: ${getErrorMessage(error)}`,
      );
    }
  }

  public generateCommand(params: GenerationParamsShort): string {
    const prefix = params.vanityAddressPrefix?.toArg() || "";
    const suffix = params.vanityAddressSuffix?.toArg() || "";
    const mask =
      params.problems.find((p) => p.type === "user-mask")?.specifier || "";

    const prefixCommand = prefix ? `prefix=${prefix}` : "";
    const suffixCommand = suffix ? `suffix=${suffix}` : "";
    const maskCommand = mask ? `mask=${mask}` : "";

    const commands = [prefixCommand, suffixCommand, maskCommand]
      .filter(Boolean)
      .join(";");

    const commandParts = [
      "profanity_cuda",
      "-k",
      this.config.kernelCount.toString(),
      "-g",
      this.config.groupCount.toString(),
      "-r",
      this.config.roundCount.toString(),
      "-p",
      `"${commands}"`,
      "-b",
      params.singlePassSeconds.toString(),
      "-z",
      params.publicKey,
    ];

    return commandParts.join(" ");
  }
}
