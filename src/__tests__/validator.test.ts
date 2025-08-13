import {
  validateAddressMatchPattern,
  validateVanityResult,
} from "../validator";
import { VanityResult } from "../node_manager/result";
import { AppContext } from "../app_context";
import { getCtxForTests } from "./utils";

const correctTestData = {
  entries: [
    {
      addr: "0xbeaf0084575a1c5f6b90525311322ed34381aee5",
      salt: "0x0000000000000088160b1dd66ca8e7dedcd1057e8a59436a45dc9a7a6463fbfa",
      pubKey:
        "0xd4a96d675423cc05f60409c48b084a53d3fa0ac59957939f526505c43f975b77fabab74decd66d80396308db9cb4db13b0c273811d51a1773d6d9e2dbcac1d28",
      pattern: "0xbeaf00",
    },
    {
      addr: "0xbeaf0080c1a3344dbda2a24a76bba7d9c2dfdc95",
      salt: "0x00000000000000a30f04e415c966d48dda041114374755927a3faf04925f7281",
      pubKey:
        "0xd4a96d675423cc05f60409c48b084a53d3fa0ac59957939f526505c43f975b77fabab74decd66d80396308db9cb4db13b0c273811d51a1773d6d9e2dbcac1d28",
      pattern: "0xbeaf",
    },
    {
      addr: "0xdeaddeade2d594dbc27f98951b85d142cb97b1ff",
      salt: "0x00000000007693556d5a74e166fd54bed060063afc793ced3466495dfe60eea6",
      pubKey:
        "0xd4a96d675423cc05f60409c48b084a53d3fa0ac59957939f526505c43f975b77fabab74decd66d80396308db9cb4db13b0c273811d51a1773d6d9e2dbcac1d28",
      pattern: "0xdeaddead",
    },
  ],
};

const incorrectTestData = new Map([
  [
    "result_not_match_pub_key",
    {
      addr: "0xdeaddeade2d594dbc27f98951b85d142cb97b1ff",
      salt: "0x00000000007693556d5a74e166fd54bed060063afc793ced3466495dfe60eea6",
      pubKey:
        "0x04b3119b330c1f23a24abcd02d5d852d301a62529db36ebf9468406fc7428b3ffc406bc47dd22188563e1feadc4196c45371eb6336d282d43d5e2b32641895c6ab",
      pattern: "deaddead",
    },
  ],
  [
    "result_not_match_pattern",
    {
      addr: "0xdeaddeade2d594dbc27f98951b85d142cb97b1ff",
      salt: "0x00000000007693556d5a74e166fd54bed060063afc793ced3466495dfe60eea6",
      pubKey:
        "0xd4a96d675423cc05f60409c48b084a53d3fa0ac59957939f526505c43f975b77fabab74decd66d80396308db9cb4db13b0c273811d51a1773d6d9e2dbcac1d28",
      pattern: "beaf00",
    },
  ],
]);

describe("VanityResult Validator", () => {
  describe("Valid Result Validation", () => {
    it("should validate correct data", async () => {
      const ctx: AppContext = getCtxForTests("test-validator-correct-input");

      for (const entry of correctTestData.entries) {
        const result: VanityResult = {
          address: entry.addr,
          salt: entry.salt,
          pubKey: entry.pubKey,
          problem: null,
          workDone: 0,
        };

        const validationResult = validateVanityResult(ctx, result);
        console.log("Validation Result:", validationResult);
        expect(validationResult.isValid).toBe(true);
      }
    });
  });

  describe("Invalid Result Detection", () => {
    it("should reject result with mismatched public key", async () => {
      const ctx: AppContext = getCtxForTests("test-validator-incorrect-input");

      for (const [testName, testCase] of incorrectTestData) {
        const result: VanityResult = {
          address: testCase.addr,
          salt: testCase.salt,
          pubKey: testCase.pubKey,
          problem: null,
          workDone: 0,
        };
        console.log(`Testing: ${testName}`);
        const validationResult = validateVanityResult(ctx, result);
        const matchedPattern = validateAddressMatchPattern(
          testCase.addr,
          testCase.pattern,
        );

        expect(validationResult.isValid && matchedPattern).toBe(false);
      }
    });
  });
});
