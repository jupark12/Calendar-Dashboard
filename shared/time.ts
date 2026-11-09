import type { CalendarEvent, Settings, Weather } from "./model";
export function dateKey(value: Date | string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
}
export function addDays(key: string, n: number): string {
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dayDifference(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
}
export function localTime(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}
export function eventOnDay(e: CalendarEvent, day: string, tz: string): boolean {
  return e.allDay
    ? e.start <= day && e.end > day
    : dateKey(e.start, tz) <= day &&
        dateKey(
          new Date(Math.max(Date.parse(e.start), Date.parse(e.end) - 1)),
          tz,
        ) >= day;
}
export function isUpcoming(e: CalendarEvent, now: Date, tz: string): boolean {
  return e.allDay
    ? e.end > dateKey(now, tz)
    : Date.parse(e.end) > now.getTime();
}
export function nightActive(
  settings: Settings,
  now: Date,
  weather: Weather | null,
): boolean {
  const n = settings.night;
  if (
    n.override !== "auto" &&
    n.overrideUntil &&
    Date.parse(n.overrideUntil) > now.getTime()
  )
    return n.override === "night";
  const day = weather?.daily.find(
    (d) => d.date === dateKey(now, settings.timezone),
  );
  if (n.solar && day)
    return now < new Date(day.sunrise) || now >= new Date(day.sunset);
  const time = localTime(now, settings.timezone);
  return n.start === n.end
    ? false
    : n.start > n.end
      ? time >= n.start || time < n.end
      : time >= n.start && time < n.end;
}
export function eventTime(e: CalendarEvent, tz: string): string {
  return e.allDay
    ? "All day"
    : new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(e.start));
}
export function weatherLabel(code: number): string {
  if (code === 0) return "Clear skies";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorms";
}
export function weatherIcon(code: number): string {
  return code === 0
    ? "☀"
    : code <= 3
      ? "☁"
      : code <= 48
        ? "≋"
        : code <= 67
          ? "☂"
          : code <= 77
            ? "❄"
            : code <= 82
              ? "☂"
              : code <= 86
                ? "❄"
                : "ϟ";
}
