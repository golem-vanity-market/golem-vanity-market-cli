import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { ethers, hexlify } from "ethers";
import {
  GenerationSuffix,
  GenerationPrefix,
  ProcessingUnitType,
} from "../params";

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
  vanityAddressSuffix?: string;
  vanityAddressLeading?: number;
  vanityAddressTrailing?: number;
  vanityAddressLettersHeavy?: number;
  vanityAddressNumbersOnly?: boolean;
  vanityAddressSnake?: number;
  vanityAddressMask?: string;
  resultsFile?: string; // Path to save results
  processingUnit?: string; // Processing unit type ('cpu' or 'gpu')
  singlePassSec?: string; // Duration of a single pass in seconds
  numResults: bigint;
  numWorkers: number;
  nonInteractive: boolean; // Run in non-interactive mode
  minOffers: number; // Minimum offers to wait for
  minOffersTimeoutSec: number; // Timeout for waiting for enough offers (`minOffers`)
  budgetInitial: number;
  budgetTopUp: number;
  budgetLimit: number;
  dbPath: string; //Location of the database
}

/**
 * Interface for validated options
 */
interface GenerateOptionsValidated {
  publicKey: PublicKey; // The actual public key content
  budgetInitial: number;
  budgetTopUp: number;
  budgetLimit: number;
  vanityAddressPrefix: GenerationPrefix | null;
  vanityAddressSuffix: GenerationSuffix | null;
  vanityAddressMask: string | null;
  processingUnitType: ProcessingUnitType;
}

/**
 * Maximum allowed vanity prefix length for security and performance
 */
const MAX_VANITY_PREFIX_LENGTH = 16;
const MAX_VANITY_SUFFIX_LENGTH = 16;
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
      `Failed to read public key file: ${String(error)}`,
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
        `Invalid public key format. ${String(error)}`,
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
export function validateProcessingUnit(
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
 * @param options - The options object containing publicKey, vanityAddressPrefix, vanityAddressSuffix, budgetGlm, and processingUnitType
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

  // Require at least one pattern to be specified
  const validPrefix =
    options.vanityAddressPrefix !== undefined &&
    options.vanityAddressPrefix !== null &&
    options.vanityAddressPrefix.length > 0 &&
    options.vanityAddressPrefix;
  const validSuffix =
    options.vanityAddressSuffix !== undefined &&
    options.vanityAddressSuffix !== null &&
    options.vanityAddressSuffix.length > 0 &&
    options.vanityAddressSuffix;

  if (
    !validPrefix &&
    !validSuffix &&
    !options.vanityAddressLeading &&
    !options.vanityAddressTrailing &&
    !options.vanityAddressLettersHeavy &&
    !options.vanityAddressNumbersOnly &&
    !options.vanityAddressSnake &&
    !options.vanityAddressMask
  ) {
    throw new GenerateCmdOptValidationError(
      "At least one pattern must be specified (vanityAddressPrefix, vanityAddressSuffix, vanityAddressLeading, vanityAddressTrailing, vanityAddressLettersHeavy, vanityAddressNumbersOnly, vanityAddressSnake, vanityAddressMask)",
    );
  }

  if (validPrefix) {
    if (!validPrefix.startsWith("0x")) {
      throw new GenerateCmdOptValidationError(
        "Vanity address prefix must start with '0x'",
        "vanityAddressPrefix",
      );
    }
    if (!/^[0-9a-f]*$/.test(validPrefix.replace("0x", ""))) {
      throw new GenerateCmdOptValidationError(
        "Vanity address prefix must only contain hexadecimal characters",
        "vanityAddressPrefix",
      );
    }
    if (validPrefix.replace("0x", "").length > MAX_VANITY_PREFIX_LENGTH) {
      throw new GenerateCmdOptValidationError(
        `Vanity address prefix too long. Maximum length is ${MAX_VANITY_PREFIX_LENGTH} characters`,
        "vanityAddressPrefix",
      );
    }
    if (validPrefix.replace("0x", "").length < 6) {
      throw new GenerateCmdOptValidationError(
        "Vanity address prefix must be at least 6 characters long",
        "vanityAddressPrefix",
      );
    }
  }

  if (validSuffix) {
    if (!/^[0-9a-f]*$/.test(validSuffix)) {
      throw new GenerateCmdOptValidationError(
        "Vanity address suffix must only contain hexadecimal characters",
        "vanityAddressSuffix",
      );
    }
    if (validSuffix.length > MAX_VANITY_SUFFIX_LENGTH) {
      throw new GenerateCmdOptValidationError(
        `Vanity address suffix too long. Maximum length is ${MAX_VANITY_SUFFIX_LENGTH} characters`,
        "vanityAddressSuffix",
      );
    }
    if (validSuffix.length < 6) {
      throw new GenerateCmdOptValidationError(
        "Vanity address suffix must be at least 6 characters long",
        "vanityAddressSuffix",
      );
    }
  }
  if (options.vanityAddressLeading) {
    if (
      isNaN(options.vanityAddressLeading) ||
      options.vanityAddressLeading < 8 ||
      options.vanityAddressLeading > 40
    ) {
      throw new GenerateCmdOptValidationError(
        "Vanity address leading must be a number between 8 and 40",
        "vanityAddressLeading",
      );
    }
  }
  if (options.vanityAddressTrailing) {
    if (
      isNaN(options.vanityAddressTrailing) ||
      options.vanityAddressTrailing < 8 ||
      options.vanityAddressTrailing > 40
    ) {
      throw new GenerateCmdOptValidationError(
        "Vanity address trailing must be a number between 8 and 40",
        "vanityAddressTrailing",
      );
    }
  }
  if (options.vanityAddressLettersHeavy) {
    if (
      isNaN(options.vanityAddressLettersHeavy) ||
      options.vanityAddressLettersHeavy < 32 ||
      options.vanityAddressLettersHeavy > 40
    ) {
      throw new GenerateCmdOptValidationError(
        "Vanity address letters heavy must be a number between 32 and 40",
        "vanityAddressLettersHeavy",
      );
    }
  }

  if (options.vanityAddressSnake) {
    if (
      isNaN(options.vanityAddressSnake) ||
      options.vanityAddressSnake < 15 ||
      options.vanityAddressSnake > 39
    ) {
      throw new GenerateCmdOptValidationError(
        "Vanity address snake must be a number between 15 and 39",
        "vanityAddressSnake",
      );
    }
  }

  if (options.vanityAddressMask) {
    const maskToLower = options.vanityAddressMask.toLowerCase();
    if (maskToLower.length !== 42) {
      throw new GenerateCmdOptValidationError(
        "Vanity address mask must be exactly 42 characters long",
        "vanityAddressMask",
      );
    }
    if (!maskToLower.startsWith("0x")) {
      throw new GenerateCmdOptValidationError(
        "Vanity address mask must start with '0x'",
        "vanityAddressMask",
      );
    }
    if (!/^[0-9a-fx]*$/.test(maskToLower)) {
      throw new GenerateCmdOptValidationError(
        "Vanity address mask must only contain hexadecimal characters and 'x' placeholders",
        "vanityAddressMask",
      );
    }
    const nonXCount = Array.from(maskToLower).filter(
      (char) => char !== "x",
    ).length;
    if (nonXCount < 6) {
      throw new GenerateCmdOptValidationError(
        "Vanity address mask must have at least 6 non-'x' characters",
        "vanityAddressMask",
      );
    }
  }

  // Validate budget constraints
  const validateBudget = (optionName: string, optionValue: unknown) => {
    if (
      optionValue === undefined ||
      optionValue === null ||
      (typeof optionValue !== "string" && typeof optionValue !== "number")
    ) {
      throw new GenerateCmdOptValidationError("Budget is required", optionName);
    }
    const valueAsNumber =
      typeof optionValue === "string" ? parseFloat(optionValue) : optionValue;
    if (isNaN(valueAsNumber)) {
      throw new GenerateCmdOptValidationError(
        "Budget must be a number",
        optionName,
      );
    }
    if (valueAsNumber <= 0) {
      throw new GenerateCmdOptValidationError(
        "Budget must be a positive number",
        optionName,
      );
    }
    if (valueAsNumber > MAX_BUDGET_GLM) {
      throw new GenerateCmdOptValidationError(
        `Budget exceeds maximum allowed. Maximum is ${MAX_BUDGET_GLM} GLM`,
        optionName,
      );
    }
    return valueAsNumber;
  };

  const parsedBudgetInitial = validateBudget(
    "budgetInitial",
    options.budgetInitial,
  );
  const parsedBudgetTopUp = validateBudget("budgetTopUp", options.budgetTopUp);
  const parsedBudgetLimit = validateBudget("budgetLimit", options.budgetLimit);

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
    vanityAddressPrefix: validPrefix ? new GenerationPrefix(validPrefix) : null,
    vanityAddressSuffix: validSuffix ? new GenerationSuffix(validSuffix) : null,
    vanityAddressMask: options.vanityAddressMask
      ? options.vanityAddressMask.toLowerCase().substring(2)
      : null,
    budgetInitial: parsedBudgetInitial,
    budgetTopUp: parsedBudgetTopUp,
    budgetLimit: parsedBudgetLimit,
    processingUnitType: processingUnitType,
  };
}

export {
  GenerateCmdOptions,
  PublicKey,
  validateGenerateOptions,
  readPublicKeyFromFile,
};
