import type { VanityResult } from "./node_manager/result";

import * as EL from "elliptic";
import { keccak256 } from "js-sha3";
import type { AppContext } from "./app_context";

const EC_INSTANCE = new EL.ec("secp256k1");

interface ValidationResult {
  isValid: boolean;
  msg?: string;
}

const UNCOMPRESSED_PUBLIC_KEY_PREFIX = "04";

function validateVanityResult(
  ctx: AppContext,
  result: VanityResult,
): ValidationResult {
  const isValidFormat = validateInputFormat(ctx, result);
  if (!isValidFormat.isValid) {
    return isValidFormat;
  }

  try {
    const pubKeyRightFormat =
      UNCOMPRESSED_PUBLIC_KEY_PREFIX + result.pubKey.slice(2);

    const pub1 = EC_INSTANCE.keyFromPublic(
      pubKeyRightFormat,
      "hex",
    ).getPublic();

    const saltKeyPair = EC_INSTANCE.keyFromPrivate(result.salt.slice(2), "hex");
    const pub2 = saltKeyPair.getPublic();

    const combinedPub = pub1.add(pub2);

    const combinedPubHex = combinedPub.encode("hex", false);

    const hash = keccak256(Buffer.from(combinedPubHex.slice(2), "hex"));

    const ethAddress = "0x" + hash.slice(-40);

    if (ethAddress.toLowerCase() !== result.address.toLowerCase()) {
      return {
        isValid: false,
        msg: `Validation failed: incorrect generated keys, expected ${result.address}, got ${ethAddress}`,
      };
    }

    return {
      isValid: true,
    };
  } catch (error) {
    return {
      isValid: false,
      msg: `Validation failed due to error: ${error}`,
    };
  }
}

function validateAddressMatchPattern(address: string, prefix: string): boolean {
  return address.startsWith(prefix);
}

function validateInputFormat(
  ctx: AppContext,
  result: VanityResult,
): ValidationResult {
  if (
    !result.pubKey ||
    !result.pubKey.startsWith("0x") ||
    result.pubKey.length !== 130
  ) {
    return { isValid: false, msg: "Invalid public key format" };
  }
  if (
    !result.salt ||
    !result.salt.startsWith("0x") ||
    result.salt.length !== 66
  ) {
    return { isValid: false, msg: "Invalid salt format" };
  }
  if (
    !result.address ||
    !result.address.startsWith("0x") ||
    result.address.length !== 42
  ) {
    return { isValid: false, msg: "Invalid address format" };
  }
  return { isValid: true };
}

export { validateVanityResult, ValidationResult, validateAddressMatchPattern };
