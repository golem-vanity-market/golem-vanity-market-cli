export function computePrefixDifficulty(prefix: string): number {
  const strippedPrefix = prefix.replace(/^0x/, "");

  const complexity = Math.pow(16, 40 - strippedPrefix.length);
  const totalComplexity = Math.pow(16, 40);

  return totalComplexity / complexity;
}

export function computeSuffixDifficulty(suffix: string): number {
  const complexity = Math.pow(16, 40 - suffix.length);
  const totalComplexity = Math.pow(16, 40);
  return totalComplexity / complexity;
}
