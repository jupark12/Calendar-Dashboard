export const format = (
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
) =>
  new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...options }).format(
    date,
  );
export function dayName(key: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...options,
  }).format(new Date(key + "T12:00:00Z"));
}
