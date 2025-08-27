import {
  exactlyLettersCombinationsDifficulty,
  snakeDifficulty,
  calculatePairs,
  numbersHeavyDifficulty,
  snakeCombinationsBigInt,
  exactlyLettersCombinationsBigInt,
} from "./math";
import { ProcessingUnitType } from "../params";
import { Problem } from "../lib/db/schema";

export type GeneratedAddressCategory =
  | "user-prefix" // The address starts with the user-defined prefix.
  | "user-suffix" // The address ends with the user-defined suffix.
  | "user-mask" // The address matches the user-defined mask (e.g., 0xabcXXXabcXXXabc where X is any character).
  | "leading-any" // The number of leading characters that are the same.
  | "trailing-any" // The number of trailing characters that are the same.
  | "letters-heavy" // Addresses with a high number of letters (a-f).
  | "numbers-heavy" // Addresses with a high number of ciphers (0-9).
  | "snake-score-no-case"; // The number of repeating characters in the address. Case insensitive.

export type ProofThresholds = {
  [key in GeneratedAddressCategory]?: number;
};

export const CPU_PROOF_THRESHOLDS: ProofThresholds = {
  "user-prefix": 6, // At least 6 characters matching user provided pattern
  "user-suffix": 6, // At least 6 characters matching user provided pattern
  "user-mask": 40, // Match the user mask exactly
  "leading-any": 8, // At least 8 leading identical characters
  "trailing-any": 8, // At least 8 trailing identical characters
  "letters-heavy": 35, // At least 35 letters (a-f)
  "numbers-heavy": 40, // At least 40 numbers (0-9)
  "snake-score-no-case": 15, // At least 15 pairs of adjacent identical characters
};

export const GPU_PROOF_THRESHOLDS: ProofThresholds = {
  "user-prefix": 8, // At least 8 characters matching user provided pattern
  "user-suffix": 8, // At least 8 characters matching user provided pattern
  "user-mask": 40, // Match the user mask exactly
  "leading-any": 8, // At least 8 leading identical characters
  "trailing-any": 8, // At least 8 trailing identical characters
  "letters-heavy": 35, // At least 35 letters (a-f)
  "numbers-heavy": 40, // At least 40 numbers (0-9)
  "snake-score-no-case": 15, // At least 15 pairs of adjacent identical characters
};

export type MatchingProblems = Array<{
  problem: Problem;
  score: number;
  difficulty: number;
}>;

export interface AddressSinglePatternScore {
  category: GeneratedAddressCategory;
  score: number;
  difficulty: number;
}

export interface AddressScore {
  addressLowerCase: string;
  addressMixedCase: string;
  scores: Record<GeneratedAddressCategory, AddressSinglePatternScore>;
  bestCategory: AddressSinglePatternScore;
}

export interface AddressProofResult {
  workDone: number;
  matchingProblems: MatchingProblems;
}

export function calculateLeadingAny(
  addressStr: string,
): AddressSinglePatternScore {
  const firstChar = addressStr[0];
  let score = 0;
  for (const char of addressStr) {
    if (char !== firstChar) {
      break;
    }
    score++;
  }
  const difficulty = Math.pow(16, score);
  return { category: "leading-any", score, difficulty };
}

export function calculateTrailingAny(
  addressStr: string,
): AddressSinglePatternScore {
  const lastChar = addressStr[addressStr.length - 1];
  let score = 0;
  for (let i = addressStr.length - 1; i >= 0; i--) {
    if (addressStr[i] !== lastChar) {
      break;
    }
    score++;
  }
  const difficulty = Math.pow(16, score);
  return { category: "trailing-any", score, difficulty };
}

function calculateLettersHeavy(addressStr: string): AddressSinglePatternScore {
  const score = (addressStr.match(/[a-f]/g) || []).length;
  const difficulty = exactlyLettersCombinationsDifficulty(score, 40);
  return { category: "letters-heavy", score, difficulty };
}

function calculateNumbersHeavy(addressStr: string): AddressSinglePatternScore {
  const score = (addressStr.match(/[0-9]/g) || []).length;
  const difficulty = numbersHeavyDifficulty(score, 40);
  return { category: "numbers-heavy", score, difficulty };
}

function calculateSnakeNoCase(addressStr: string): AddressSinglePatternScore {
  const score = calculatePairs(addressStr);
  const difficulty = snakeDifficulty(score, 40);
  return { category: "snake-score-no-case", score, difficulty };
}

function calculateUserPrefix(
  addressStr: string,
  userPattern: string,
): AddressSinglePatternScore {
  const patternLength = userPattern.length;
  const userPatternFixed = (
    userPattern.startsWith("0x") ? userPattern.slice(2) : userPattern
  ).toLowerCase();
  // score == how many starting chars match
  let score = 0;
  for (let i = 0; i < patternLength; i++) {
    if (addressStr[i] === userPatternFixed[i]) {
      score++;
    } else {
      break;
    }
  }
  const difficulty = Math.pow(16, score);
  return { category: "user-prefix", score, difficulty };
}

export function calculateUserSuffix(
  addressStr: string,
  userPattern: string,
): AddressSinglePatternScore {
  const patternLength = userPattern.length;
  const userPatternFixed = userPattern.toLowerCase();
  // score == how many ending chars match
  let score = 0;
  for (let i = 0; i < patternLength; i++) {
    if (
      addressStr[addressStr.length - 1 - i] ===
      userPatternFixed[patternLength - 1 - i]
    ) {
      score++;
    } else {
      break;
    }
  }
  const difficulty = Math.pow(16, score);
  return { category: "user-suffix", score, difficulty };
}

export function calculateUserMask(
  addressStr: string,
  userPattern: string,
): AddressSinglePatternScore {
  const patternLength = userPattern.length;
  const addressFixed = addressStr.startsWith("0x")
    ? addressStr.slice(2)
    : addressStr;
  // score == how many chars match the mask (X is a wildcard)
  // difficulty == how many non-wildcard chars match
  let score = 0;
  let matchingChars = 0;
  for (let i = 0; i < patternLength; i++) {
    if (userPattern[i] === "x") {
      score++;
      continue;
    }
    if (addressFixed[i] === userPattern[i]) {
      score++;
      matchingChars++;
    }
  }
  const difficulty = Math.pow(16, matchingChars);
  return { category: "user-mask", score, difficulty };
}

export function scoreProblem(address: string, problem: Problem) {
  switch (problem.type) {
    case "user-prefix":
      return calculateUserPrefix(address, problem.specifier);
    case "user-suffix":
      return calculateUserSuffix(address, problem.specifier);
    case "user-mask":
      return calculateUserMask(address, problem.specifier);
    case "leading-any":
      return calculateLeadingAny(address);
    case "trailing-any":
      return calculateTrailingAny(address);
    case "letters-heavy":
      return calculateLettersHeavy(address);
    case "numbers-heavy":
      return calculateNumbersHeavy(address);
    case "snake-score-no-case":
      return calculateSnakeNoCase(address);
    default:
      throw new Error(`Unknown problem type: ${problem}`);
  }
}

/**
 * Score address against multiple problems and return best score (highest difficulty).
 */
export function scoreProblems(address: string, problems: Problem[]) {
  const addressFixed = (
    address.startsWith("0x") ? address.slice(2) : address
  ).toLowerCase();
  return problems
    .map((problem) => scoreProblem(addressFixed, problem))
    .reduce((a, b) => (a.difficulty > b.difficulty ? a : b));
}

const TOTAL_ADDRESS_SPACE = 16n ** 40n;

/**
 * Calculates the size of the "problem space" for a given category and threshold.
 * This is the number of addresses that meet or exceed the threshold.
 * NOTE: This calculation sums the spaces for each category, ignoring overlaps.
 */
export function calculateProbabilitySpace(
  category: GeneratedAddressCategory,
  threshold: number,
): bigint {
  switch (category) {
    case "user-prefix": {
      // The number of addresses with at least `threshold` characters matching the user-defined pattern.
      if (threshold > 40 || threshold < 1) return 0n;
      return 16n ** BigInt(40 - threshold);
    }

    case "user-suffix": {
      // The number of addresses with at least `threshold` characters matching the user-defined pattern.
      if (threshold > 40 || threshold < 1) return 0n;
      return 16n ** BigInt(40 - threshold);
    }

    case "user-mask": {
      // The number of addresses with at least `threshold` characters matching the user-defined mask.
      if (threshold > 40 || threshold < 1) return 0n;
      return 16n ** BigInt(40 - threshold);
    }

    case "leading-any": {
      // The number of addresses with at least `threshold` identical leading characters.
      if (threshold > 40 || threshold < 1) return 0n;
      return 16n * 16n ** BigInt(40 - threshold);
    }

    case "trailing-any": {
      // The number of addresses with at least `threshold` identical trailing characters.
      if (threshold > 40 || threshold < 1) return 0n;
      return 16n * 16n ** BigInt(40 - threshold);
    }

    case "letters-heavy": {
      // At least `threshold` letters. We must sum combinations for k = threshold, threshold+1, ..., 40.
      let total = 0n;
      for (let k = threshold; k <= 40; k++) {
        total += exactlyLettersCombinationsBigInt(k, 40);
      }
      return total;
    }

    case "numbers-heavy": {
      // At least `threshold` numbers. This is equivalent to at most `40-threshold` letters.
      let total = 0n;
      for (let k = threshold; k <= 40; k++) {
        // An address with `k` numbers has `40-k` letters.
        total += exactlyLettersCombinationsBigInt(40 - k, 40);
      }
      return total;
    }

    case "snake-score-no-case": {
      // At least `threshold` adjacent pairs. Max pairs is 39.
      let total = 0n;
      for (let k = threshold; k <= 39; k++) {
        total += snakeCombinationsBigInt(k, 40);
      }
      return total;
    }

    default:
      throw new Error(`Unknown category: ${category}`);
  }
}

/**
 * Calculate the number of addresses that need to be checked on average
 * to find an address matching at least one problem. If thresholds are not
 * provided the calculation will be done based on the thresholds defined in each problem
 */
export function calculateWorkUnitForProblems(
  problems: Problem[],
  thresholds?: ProofThresholds,
): number {
  if (!thresholds) {
    thresholds = problems.reduce((acc, problem) => {
      switch (problem.type) {
        case "user-prefix":
          acc[problem.type] = problem.specifier.replace(/^0x/, "").length;
          break;
        case "user-suffix":
          acc[problem.type] = problem.specifier.length;
          break;
        case "user-mask":
          acc[problem.type] = problem.specifier.replace(/x/g, "").length;
          break;
        case "leading-any":
          acc[problem.type] = problem.length;
          break;
        case "trailing-any":
          acc[problem.type] = problem.length;
          break;
        case "letters-heavy":
          acc[problem.type] = problem.count;
          break;
        case "numbers-heavy":
          acc[problem.type] = 40;
          break;
        case "snake-score-no-case":
          acc[problem.type] = problem.count;
          break;
        default:
          break;
      }
      return acc;
    }, {} as ProofThresholds);
  }

  let totalProbabilitySpace = 0n;

  for (const problem of problems) {
    const category = problem.type;
    const threshold = thresholds[category];
    if (threshold === undefined) continue;
    totalProbabilitySpace += calculateProbabilitySpace(category, threshold);
  }

  return Number(TOTAL_ADDRESS_SPACE / totalProbabilitySpace || 1n);
}

/**
 * Check if the address meets the proof requirements for the given problems and processing unit.
 * If yes, return the problem passed and estimated work done.
 */
export function checkAddressProof(
  address: string,
  problems: Problem[],
  processingUnit: ProcessingUnitType,
): AddressProofResult {
  const thresholds =
    processingUnit === ProcessingUnitType.CPU
      ? CPU_PROOF_THRESHOLDS
      : GPU_PROOF_THRESHOLDS;

  const workPerProof = calculateWorkUnitForProblems(problems, thresholds);

  const addressFixed = (
    address.startsWith("0x") ? address.slice(2) : address
  ).toLowerCase();

  const matchingProblems: MatchingProblems = [];
  for (const problem of problems) {
    const problemScore = scoreProblem(addressFixed, problem);
    if (
      problemScore.score >=
      (thresholds[problem.type] || Number.POSITIVE_INFINITY)
    ) {
      matchingProblems.push({
        problem,
        score: problemScore.score,
        difficulty: problemScore.difficulty,
      });
    }
  }

  if (matchingProblems.length === 0) {
    return {
      matchingProblems: [],
      workDone: 0,
    };
  }

  return {
    matchingProblems,
    workDone: workPerProof,
  };
}
