const TOKYO_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

export function getTokyoBusinessParts(date = new Date()) {
  const parts = Object.fromEntries(
    TOKYO_FORMATTER.formatToParts(date).map(({ type, value }) => [type, value]),
  );

  return {
    businessDate: `${parts.year}-${parts.month}-${parts.day}`,
    businessHour: Number(parts.hour),
  };
}
