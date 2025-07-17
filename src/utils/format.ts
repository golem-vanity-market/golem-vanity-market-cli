export const displayDifficulty = (difficulty: number): string => {
  const units = ["", "kH", "MH", "GH", "TH", "PH", "EH", "ZH", "YH"];
  let unitIndex = 0;

  while (difficulty >= 1000 && unitIndex < units.length - 1) {
    difficulty /= 1000;
    unitIndex++;
  }

  const precision = difficulty < 10 ? 2 : difficulty < 100 ? 1 : 0;
  return difficulty.toFixed(precision) + units[unitIndex];
};

export const displayTime = (extraLabel: string, seconds: number): string => {
  const units = [
    { label: "month", seconds: 2_592_000, cutoff: 604_800 * 9.9 }, // 30 days
    { label: "week", seconds: 604_800, cutoff: 86_400 * 9.9 }, // 7 days
    { label: "day", seconds: 86_400, cutoff: 3600 * 48 }, // 24 hours
    { label: "hour", seconds: 3_600, cutoff: 60 * 99 }, // 60 minutes
    { label: "minute", seconds: 60, cutoff: 99 }, // 60 seconds
    { label: "second", seconds: 1, cutoff: 0 },
  ];

  for (const unit of units) {
    if (seconds >= unit.cutoff) {
      const value = seconds / unit.seconds;
      const precision = value < 10 ? 2 : value < 100 ? 1 : 0;
      return `${value.toFixed(precision)} ${extraLabel}${unit.label}${value >= 2 ? "s" : ""}`;
    }
  }

  return "0 seconds"; // Edge case for 0 input
};
