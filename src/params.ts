import { getBytes, hexlify } from "ethers";
import { Problem } from "./lib/db/schema";

export interface GenerationParamsShort {
  vanityAddressPrefix: GenerationPrefix | null;
  vanityAddressSuffix: GenerationSuffix | null;
  problems: Problem[];
  singlePassSeconds: number;
  publicKey: string;
}

/**
 * Interface for task generation parameters
 */
export interface GenerationParams {
  publicKey: string;
  vanityAddressPrefix: GenerationPrefix | null;
  vanityAddressSuffix: GenerationSuffix | null;
  problems: Problem[];
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

export class GenerationSuffix {
  val: Uint8Array<ArrayBufferLike>;
  original: string;

  constructor(suffix: string) {
    const suffixOrig = suffix;
    while (suffix.length < 8) {
      suffix = "0" + suffix;
    }
    const byt = getBytes("0x" + suffix.slice(0, 8));
    this.val = byt;
    this.original = suffixOrig;
  }

  fullSuffix(): string {
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
