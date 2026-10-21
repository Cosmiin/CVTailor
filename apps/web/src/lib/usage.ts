export const formatTokenCount = (value: number) => new Intl.NumberFormat("en-US").format(value);

export const formatDurationSeconds = (value: number) => {
  const seconds = Math.max(0, Math.round(value));
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};

export const formatUsdCost = (value: number | null) => {
  if (value === null) return "Rate unavailable";
  const digits = value > 0 && value < 0.01 ? 6 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
};
