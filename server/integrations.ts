import ical from "node-ical";
import { z } from "zod";
import { createHash } from "node:crypto";
import type {
  Alert,
  CalendarEvent,
  Settings,
  Snapshot,
  SyncState,
  Weather,
} from "../shared/model";
import { addDays, dateKey } from "../shared/time";
import type { Store } from "./database";
import { demoEvents, demoWeather } from "./demo";
export function calendarWindow(settings: Settings, now = new Date()) {
  const today = dateKey(now, settings.timezone);
  return { start: addDays(today, -42), end: addDays(today, 100) };
}
export async function parseCalendar(
  text: string,
  calendarId: string,
  range: { start: string; end: string },
): Promise<CalendarEvent[]> {
  const parsed = await ical.async.parseICS(text);
  const result: CalendarEvent[] = [];
  for (const event of Object.values(parsed)) {
    if (!event || event.type !== "VEVENT" || event.status === "CANCELLED")
      continue;
    const instances = ical.expandRecurringEvent(event, {
      from: new Date(range.start + "T00:00:00Z"),
      to: new Date(range.end + "T23:59:59Z"),
      expandOngoing: true,
    });
    for (const instance of instances) {
      if (instance.event.status === "CANCELLED") continue;
      const tz = event.start.tz || "UTC";
      const start = instance.isFullDay
        ? dateKey(instance.start, tz)
        : instance.start.toISOString();
      const end = instance.isFullDay
        ? dateKey(instance.end, tz)
        : instance.end.toISOString();
      result.push({
        id: createHash("sha256")
          .update(calendarId + event.uid + start)
          .digest("hex")
          .slice(0, 24),
        uid: event.uid,
        calendarId,
        title: String(instance.summary || "Untitled event"),
        start,
        end,
        allDay: instance.isFullDay,
      });
      if (result.length > 5000)
        throw new Error("Calendar instance limit exceeded");
    }
  }
  return result;
}
export function deduplicate(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>();
  return events
    .filter((e) => {
      const key = e.uid + "|" + e.start;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}
async function limitedFetch(
  url: string,
  headers: Record<string, string> = {},
  limit = 5_000_000,
) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (response.status === 304) return { response, text: "" };
  if (!response.ok) throw new Error("Provider unavailable");
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit) throw new Error("Response too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return { response, text: Buffer.concat(chunks).toString("utf8") };
}
const numbers = z.array(z.number());
const weatherSchema = z.object({
  current: z.object({
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    weather_code: z.number(),
  }),
  hourly: z.object({
    time: numbers,
    temperature_2m: numbers,
    precipitation_probability: numbers,
    weather_code: numbers,
  }),
  daily: z.object({
    time: numbers,
    temperature_2m_max: numbers,
    temperature_2m_min: numbers,
    weather_code: numbers,
    sunrise: numbers,
    sunset: numbers,
  }),
});
export async function fetchWeather(settings: Settings): Promise<Weather> {
  const p = new URLSearchParams({
    latitude: String(settings.location.latitude),
    longitude: String(settings.location.longitude),
    timezone: settings.timezone,
    temperature_unit: "fahrenheit",
    timeformat: "unixtime",
    forecast_days: "7",
    current: "temperature_2m,apparent_temperature,weather_code",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    daily: "temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset",
  });
  const { text } = await limitedFetch(
    "https://api.open-meteo.com/v1/forecast?" + p,
  );
  const d = weatherSchema.parse(JSON.parse(text));
  return {
    current: {
      temperature: d.current.temperature_2m,
      feelsLike: d.current.apparent_temperature,
      code: d.current.weather_code,
    },
    hourly: d.hourly.time.map((t, i) => ({
      time: new Date(t * 1000).toISOString(),
      temperature: d.hourly.temperature_2m[i],
      rain: d.hourly.precipitation_probability[i],
      code: d.hourly.weather_code[i],
    })),
    daily: d.daily.time.map((t, i) => ({
      date: dateKey(new Date(t * 1000), settings.timezone),
      high: d.daily.temperature_2m_max[i],
      low: d.daily.temperature_2m_min[i],
      code: d.daily.weather_code[i],
      sunrise: new Date(d.daily.sunrise[i] * 1000).toISOString(),
      sunset: new Date(d.daily.sunset[i] * 1000).toISOString(),
    })),
  };
}
const alertSchema = z.object({
  features: z.array(
    z.object({
      id: z.string(),
      properties: z.object({
        headline: z.string().nullable(),
        event: z.string(),
        severity: z.string(),
        description: z.string(),
        expires: z.string(),
      }),
    }),
  ),
});
export async function fetchAlerts(
  settings: Settings,
  userAgent: string,
): Promise<Alert[]> {
  const { text } = await limitedFetch(
    `https://api.weather.gov/alerts/active?point=${settings.location.latitude},${settings.location.longitude}`,
    { "User-Agent": userAgent, Accept: "application/geo+json" },
  );
  const data = alertSchema.parse(JSON.parse(text));
  return data.features.map((f) => ({
    id: f.id,
    title: f.properties.headline || f.properties.event,
    severity: f.properties.severity,
    description: f.properties.description,
    expires: f.properties.expires,
  }));
}
type Cache<T> = { data: T; state: SyncState; next: number; failures: number };
export class Integrations {
  private busy = false;
  constructor(
    private store: Store,
    private demo: boolean,
    private feeds: Record<string, string>,
    private userAgent: string,
  ) {}
  invalidate() {
    for (const key of [
      "weather",
      "alerts",
      ...this.store.settings().calendars.map((c) => "calendar:" + c.id),
    ]) {
      const cache = this.store.get<Cache<unknown>>(key);
      if (cache) this.store.set(key, { ...cache, next: 0 });
    }
  }
  private async refresh<T>(
    key: string,
    minutes: number,
    fetcher: () => Promise<T>,
  ) {
    const cache = this.store.get<Cache<T>>(key);
    if (cache && cache.next > Date.now()) return;
    const settingsAtStart = JSON.stringify(this.store.settings());
    try {
      const data = await fetcher();
      if (settingsAtStart !== JSON.stringify(this.store.settings())) return;
      this.store.set(key, {
        data,
        state: { lastSuccess: new Date().toISOString(), error: null },
        next: Date.now() + minutes * 60000,
        failures: 0,
      });
    } catch {
      if (settingsAtStart !== JSON.stringify(this.store.settings())) return;
      const failures = (cache?.failures ?? 0) + 1;
      this.store.set(key, {
        data: cache?.data ?? null,
        state: {
          lastSuccess: cache?.state.lastSuccess ?? null,
          error: "Unable to sync. Showing last available data.",
        },
        next: Date.now() + Math.min(60, 2 ** Math.min(failures, 6)) * 60000,
        failures,
      });
    }
  }
  async sync() {
    if (this.demo || this.busy) return;
    this.busy = true;
    try {
      const settings = this.store.settings();
      await Promise.all([
        this.refresh("weather", 15, () => fetchWeather(settings)),
        this.refresh("alerts", 5, () => fetchAlerts(settings, this.userAgent)),
        ...settings.calendars.map((c) =>
          this.refresh("calendar:" + c.id, 15, async () => {
            const feed = this.feeds[c.id];
            if (!feed) throw new Error("Not configured");
            const url = new URL(feed);
            if (
              url.protocol !== "https:" ||
              url.hostname !== "calendar.google.com" ||
              url.username ||
              url.password ||
              url.port
            )
              throw new Error("Only Google HTTPS feeds supported");
            const old = this.store.get<{
              etag: string;
              modified: string;
              ics: string;
            }>("feed:" + c.id);
            const headers: Record<string, string> = {};
            if (old?.etag) headers["If-None-Match"] = old.etag;
            if (old?.modified) headers["If-Modified-Since"] = old.modified;
            const { response, text } = await limitedFetch(feed, headers);
            const ics = response.status === 304 ? old?.ics : text;
            if (!ics || !ics.includes("BEGIN:VCALENDAR"))
              throw new Error("Invalid calendar");
            const events = await parseCalendar(
              ics,
              c.id,
              calendarWindow(settings),
            );
            this.store.set("feed:" + c.id, {
              etag: response.headers.get("etag") || old?.etag || "",
              modified:
                response.headers.get("last-modified") || old?.modified || "",
              ics,
            });
            return events;
          }),
        ),
      ]);
    } finally {
      this.busy = false;
    }
  }
  snapshot(): Snapshot {
    const settings = this.store.settings();
    const calendarRange = calendarWindow(settings);
    if (this.demo) {
      const demoNow = new Date(Math.floor(Date.now() / 3600000) * 3600000);
      const state = { lastSuccess: demoNow.toISOString(), error: null };
      return {
        demo: true,
        settings,
        items: this.store.items(),
        events: demoEvents(settings),
        weather: demoWeather(settings, demoNow),
        alerts: [],
        sync: { calendar: state, weather: state, alerts: state },
        calendarRange,
      };
    }
    const w = this.store.get<Cache<Weather>>("weather"),
      a = this.store.get<Cache<Alert[]>>("alerts");
    const calendars = settings.calendars.map((c) =>
      this.store.get<Cache<CalendarEvent[]>>("calendar:" + c.id),
    );
    const empty: SyncState = {
      lastSuccess: null,
      error: "Waiting for first sync",
    };
    const times = calendars
      .map((c) => c?.state.lastSuccess)
      .filter((x): x is string => !!x)
      .sort();
    return {
      demo: false,
      settings,
      items: this.store.items(),
      events: deduplicate(calendars.flatMap((c) => c?.data ?? [])),
      weather: w?.data ?? null,
      alerts: (a?.data ?? []).filter((a) => Date.parse(a.expires) > Date.now()),
      sync: {
        calendar: {
          lastSuccess:
            times.length === calendars.length ? (times[0] ?? null) : null,
          error: calendars.some((c) => !c || c.state.error)
            ? "One or more calendars are unavailable or not configured."
            : null,
        },
        weather: w?.state ?? empty,
        alerts: a?.state ?? empty,
      },
      calendarRange,
    };
  }
}
