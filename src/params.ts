import { getBytes, hexlify } from "ethers";

/**
 * Interface for task generation parameters
 */
export interface GenerationParams {
  publicKey: string;
  vanityAddressPrefix: GenerationPrefix;
  budgetInitial: number;
  budgetTopUp: number;
  budgetLimit: number;
  numberOfWorkers: number;
  singlePassSeconds: number;
  numResults: bigint;
}

export class GenerationPrefix {
  val: Uint8Array<ArrayBufferLike>;
  original: string;

  constructor(prefix: string) {
    const prefixOrig = prefix;
    while (prefix.length < 10) {
      prefix = prefix + "0";
    }
    const byt = getBytes(prefix.slice(0, 10));
    if (byt.length !== 4) {
      throw new Error("Prefix must be exactly 8 bytes long");
    }
    this.val = byt;
    this.original = prefixOrig;
  }

  fullPrefix(): string {
    return this.original;
  }

  toHex(): string {
    return hexlify(this.val);
  }

  toArg(): string {
    return BigInt(hexlify(this.val.slice().reverse())).toString(10);
  }
}

/**
 * Supported processing unit types
 */

export enum ProcessingUnitType {
  CPU = "cpu",
  GPU = "gpu",
}
