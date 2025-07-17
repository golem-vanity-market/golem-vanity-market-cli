import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { ethers, hexlify } from "ethers";
import { GenerationPrefix, ProcessingUnitType } from "../params";

/**
 * Custom error class for address generation validation errors
 */
class GenerateCmdOptValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message + ": " + field);
    this.name = "GenerateCmdOptValidationError";
  }
}

/**
 * Interface for generate command options
 */
interface GenerateCmdOptions {
  publicKey?: string; // The actual public key content
  publicKeyPath?: string; // Path to the public key file
  vanityAddressPrefix?: string;
  budgetGlm?: number;
  prefix?: string;
  resultsFile?: string; // Path to save results
  processingUnit?: string; // Processing unit type ('cpu' or 'gpu')
  singlePassSec?: string; // Duration of a single pass in seconds
  numResults: bigint;
  numWorkers: number;
  nonInteractive: boolean; // Run in non-interactive mode
  minOffers: number; // Minimum offers to wait for
  minOffersTimeoutSec: number; // Timeout for waiting for enough offers (`minOffers`)
}

/**
 * Interface for validated options
 */
interface GenerateOptionsValidated {
  publicKey: PublicKey; // The actual public key content
  budgetGlm?: number;
  vanityAddressPrefix: GenerationPrefix;
  processingUnitType: ProcessingUnitType;
}

/**
 * Maximum allowed vanity prefix length for security and performance
 */
const MAX_VANITY_PREFIX_LENGTH = 16;

/**
 * Maximum budget to prevent excessive resource usage
 */
const MAX_BUDGET_GLM = 1000;

/**
 * Reads and validates a public key from a file path
 * @param publicKeyPath - Path to the file containing the public key
 * @returns The public key content as a string
 * @throws {GenerateCmdOptValidationError} When file cannot be read or contains invalid format
 */
function readPublicKeyFromFile(publicKeyPath: string): string {
  try {
    // Resolve the path to handle relative paths
    const resolvedPath = resolve(publicKeyPath);

    // Check if file exists
    if (!existsSync(resolvedPath)) {
      throw new GenerateCmdOptValidationError(
        `Public key file not found: ${resolvedPath}`,
        publicKeyPath,
      );
    }

    // Read file content
    const fileContent = readFileSync(resolvedPath, "utf8").trim();

    if (!fileContent) {
      throw new GenerateCmdOptValidationError(
        "Public key file is empty",
        publicKeyPath,
      );
    }

    return fileContent;
  } catch (error) {
    if (error instanceof GenerateCmdOptValidationError) {
      throw error;
    }
    throw new GenerateCmdOptValidationError(
      `Failed to read public key file: ${error}`,
      "publicKeyPath",
    );
  }
}

class PublicKey {
  bytes: Uint8Array;

  constructor(publicKey: string) {
    if (!publicKey.startsWith("0x")) {
      publicKey = "0x" + publicKey; // Ensure public key starts with '0x'
    }
    let byteArray: Uint8Array<ArrayBufferLike>;
    try {
      byteArray = ethers.getBytes(publicKey);
    } catch (error) {
      throw new GenerateCmdOptValidationError(
        `Invalid public key format. ${error}`,
        publicKey,
      );
    }

    if (byteArray.length != 65) {
      throw new GenerateCmdOptValidationError(
        "Public key must be 65 bytes long",
        publicKey,
      );
    }
    if (byteArray[0] !== 4) {
      throw new GenerateCmdOptValidationError(
        "Public key must start with byte 0x04",
        publicKey,
      );
    }

    this.bytes = byteArray;
  }

  toHex(): string {
    return hexlify(this.bytes);
  }

  toTruncatedHex(): string {
    return this.toHex().replace("0x04", "");
  }
}

/**
 * Validates the processing unit type
 * @param processingUnitType - Processing unit type string ('cpu' or 'gpu')
 * @returns ProcessingUnitType enum value
 * @throws {GenerateCmdOptValidationError} When processing unit type is invalid
 */
function validateProcessingUnit(
  processingUnitType?: string,
): ProcessingUnitType {
  if (!processingUnitType) {
    return ProcessingUnitType.GPU; // Default to GPU for backward compatibility
  }

  const normalizedType = processingUnitType.toLowerCase();
  if (normalizedType === "cpu") {
    return ProcessingUnitType.CPU;
  } else if (normalizedType === "gpu") {
    return ProcessingUnitType.GPU;
  } else {
    throw new GenerateCmdOptValidationError(
      `Invalid processing unit '${processingUnitType}'. Must be 'cpu' or 'gpu'`,
      "processingUnit",
    );
  }
}

/**
 * Validates generate command options with comprehensive error checking
 * @param options - The options object containing publicKey, vanityAddressPrefix, budgetGlm, and processingUnitType
 * @throws {GenerateCmdOptValidationError} When validation fails
 */
function validateGenerateOptions(
  options: GenerateCmdOptions,
): GenerateOptionsValidated {
  // Validate public key presence and format
  if (!options.publicKey) {
    throw new GenerateCmdOptValidationError(
      "Public key is required",
      "publicKey",
    );
  }

  const publicKey = new PublicKey(options.publicKey);

  // Validate vanity address prefix presence and constraints
  if (
    options.vanityAddressPrefix === undefined ||
    options.vanityAddressPrefix === null
  ) {
    throw new GenerateCmdOptValidationError(
      "Vanity address prefix is required",
      "vanityAddressPrefix",
    );
  }

  if (options.vanityAddressPrefix.length === 0) {
    throw new GenerateCmdOptValidationError(
      "Vanity address prefix cannot be empty",
      "vanityAddressPrefix",
    );
  }

  if (
    options.vanityAddressPrefix.replace("0x", "").length >
    MAX_VANITY_PREFIX_LENGTH
  ) {
    throw new GenerateCmdOptValidationError(
      `Vanity address prefix too long. Maximum length is ${MAX_VANITY_PREFIX_LENGTH} characters`,
      "vanityAddressPrefix",
    );
  }

  // Validate budget constraints
  if (options.budgetGlm === undefined || options.budgetGlm === null) {
    throw new GenerateCmdOptValidationError("Budget is required", "budgetGlm");
  }

  if (options.budgetGlm <= 0) {
    throw new GenerateCmdOptValidationError(
      "Budget must be a positive number",
      "budgetGlm",
    );
  }

  if (options.budgetGlm > MAX_BUDGET_GLM) {
    throw new GenerateCmdOptValidationError(
      `Budget exceeds maximum allowed. Maximum is ${MAX_BUDGET_GLM} GLM`,
      "budgetGlm",
    );
  }

  if (options.minOffers < 0 || isNaN(options.minOffers)) {
    throw new GenerateCmdOptValidationError(
      "Minimum offers must be a non-negative number",
      "minOffers",
    );
  }

  if (isNaN(options.minOffersTimeoutSec) || options.minOffersTimeoutSec < 0) {
    throw new GenerateCmdOptValidationError(
      "Minimum offers timeout must be a non-negative number",
      "minOffersTimeoutSec",
    );
  }

  // Validate worker type
  const processingUnitType = validateProcessingUnit(options.processingUnit);

  return {
    publicKey: publicKey,
    vanityAddressPrefix: new GenerationPrefix(options.vanityAddressPrefix),
    budgetGlm: options.budgetGlm,
    processingUnitType: processingUnitType,
  };
}

export {
  GenerateCmdOptions,
  PublicKey,
  validateGenerateOptions,
  readPublicKeyFromFile,
};
