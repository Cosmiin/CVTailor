export const formatTokenCount = (value: number) => new Intl.NumberFormat("en-US").format(value);

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
