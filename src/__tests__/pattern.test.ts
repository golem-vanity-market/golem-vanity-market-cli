import { Problem } from "../lib/db/schema";
import {
  binomialCoefficient,
  exactlyLettersCombinations,
  exactlyLettersCombinationsDifficulty,
  totalCombinations,
} from "../pattern/math";
import { scoreProblems } from "../pattern/pattern";

const ALL_PROBLEMS: Problem[] = [
  { type: "leading-any", length: 6 },
  { type: "trailing-any", length: 6 },
  { type: "user-prefix", specifier: "0x1234567890abcdef" },
  {
    type: "user-mask",
    specifier: "abcxxxxxxxxxxx00xxxxxxxxxxx00xxxxxxxxcba",
  },
  { type: "user-suffix", specifier: "987654321" },
  { type: "letters-heavy", count: 32 },
  { type: "numbers-heavy" },
  { type: "snake-score-no-case", count: 15 },
];

describe("Pattern Scoring", () => {
  describe("scoreProblems", () => {
    it("should correctly score an address with a user-defined prefix", () => {
      const address = "0x1234567890abcd0f1234567890abcdef12345678";
      const result = scoreProblems(address, ALL_PROBLEMS); // 14/16 chars will match
      const expectedScore = 14;
      expect(result.category).toBe("user-prefix");
      expect(result.score).toBe(expectedScore);
      expect(result.difficulty).toBe(Math.pow(16, expectedScore));
    });

    it("should correctly identify 'leading-any' as the best category", () => {
      const address = "0xaaaaaaaaaaaaaaaaaaaa01234567890123456789";
      const result = scoreProblems(address, ALL_PROBLEMS);
      const expectedScore = 20;

      expect(result.category).toBe("leading-any");
      expect(result.score).toBe(expectedScore);
      expect(result.difficulty).toBeGreaterThan(1e15); // Should be very high
    });

    it("should correctly identify 'trailing-any' as the best category", () => {
      const address = "0xabcd5678901234567890aaaaaaaaaaaaaaaaaaaa";
      const result = scoreProblems(address, ALL_PROBLEMS);
      const expectedScore = 20;

      expect(result.category).toBe("trailing-any");
      expect(result.score).toBe(expectedScore);
      expect(result.difficulty).toBeGreaterThan(1e15); // Should be very high
    });

    it("should correctly identify 'letters-heavy' as the best category", () => {
      const address = "0xabcDefabcdefabcdefabcdefabcdefabcdefabcd";
      const result = scoreProblems(address, ALL_PROBLEMS);
      const expectedScore = 40; // 40 letters

      expect(result.category).toBe("letters-heavy");
      expect(result.score).toBe(expectedScore);
      expect(result.difficulty).toBeGreaterThan(1e15); // Should be very high
    });

    it("should correctly identify 'numbers-heavy' as the best category", () => {
      const address = "0x1234123412341234123412341234123412341234";
      const result = scoreProblems(address, ALL_PROBLEMS);

      expect(result.category).toBe("numbers-heavy");
      expect(result.score).toBe(40);
      expect(result.difficulty).toBe(1 / (10 / 16) ** 40); // every (40) character is a number (10 choices out of 16)
    });

    it("should correctly identify 'user-suffix' as the best category", () => {
      const address = "0xabcabcabcabcdef1234567890abcdef987654321";
      const result = scoreProblems(address, ALL_PROBLEMS);
      const expectedScore = 9;
      expect(result.category).toBe("user-suffix");
      expect(result.score).toBe(expectedScore);
      expect(result.difficulty).toBe(Math.pow(16, expectedScore));
    });

    it("should correctly identify 'user-mask' as the best category", () => {
      const address = "0xabcabcabcabcde00234567890ab00ef987654cba";
      const result = scoreProblems(address, ALL_PROBLEMS);
      const expectedScore = 40;
      expect(result.category).toBe("user-mask");
      expect(result.score).toBe(expectedScore);
      expect(result.difficulty).toBe(Math.pow(16, 10)); // the mask has 10 characters that are not wildcards
    });

    it("should correctly identify 'snake-score-no-case' as the best category", () => {
      // This address has a high snake score but is weak in other categories
      const address = "0x2111111111111111111111111111111111111112";
      const result = scoreProblems(address, ALL_PROBLEMS);

      const expectedScore = 37; // 37 '1's in a row

      expect(result.category).toBe("snake-score-no-case");
      expect(result.score).toBe(expectedScore);
      expect(result.difficulty).toBeGreaterThan(1e15); // Should be very high
    });
  });
  describe("Math Functions", () => {
    it("should calculate the binomial coefficient", () => {
      expect(binomialCoefficient(40, 1)).toBe(40);
      expect(binomialCoefficient(40, 2)).toBe(780);
    });

    it("should correctly calculate total and exact combinations", () => {
      // test against known values
      expect(totalCombinations(40)).toBeCloseTo(1.461501637330903e48);

      expect(exactlyLettersCombinations(40, 40)).toBeCloseTo(
        1.3367494538843734e31,
      );
      expect(exactlyLettersCombinations(39, 40)).toBeCloseTo(
        8.911663025895824e32,
      );
      const probabilityAllLetters =
        exactlyLettersCombinations(40, 40) / totalCombinations(40);
      expect(probabilityAllLetters).toBeCloseTo(9.14641092243755e-18, 19); // up to 19 decimal places
    });

    it("should produce difficulty results consistent with the original Rust tests", () => {
      const difficulty39 = exactlyLettersCombinationsDifficulty(39, 40);
      const difficulty40 = exactlyLettersCombinationsDifficulty(40, 40);
      expect(difficulty40).toBeGreaterThan(difficulty39);
      // test against known values
      expect(difficulty39).toBeCloseTo(1615751276481489, 0); // (16^40) /  ((binomialCoefficient(40, 1) * 10^1 + 6^39) + (6^40))
      expect(difficulty40).toBeCloseTo(109332503041914110, 0); // (16^40) / (6^40)

      const ratio = difficulty40 / difficulty39;
      // ratio should be around 67.79, but due to javascript floating point precision
      // it might not be exact, so we allow a small margin of error
      expect(Math.abs(ratio - 67.79)).toBeLessThan(0.5);
    });
  });
});
