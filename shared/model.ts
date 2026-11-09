import { z } from "zod";
export const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    "Invalid date",
  );
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const calendarSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,32}$/),
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[\da-fA-F]{6}$/),
  kind: z.enum(["personal", "household", "birthday", "anniversary"]),
  upcoming: z.boolean(),
});
export const scheduleSchema = z.object({
  id: z.enum(["trash", "recycling"]),
  label: z.string().trim().min(1).max(40),
  anchor: dateKeySchema,
  rule: z.string().max(200),
  skips: z.array(dateKeySchema).max(100),
  overrides: z
    .array(z.object({ from: dateKeySchema, to: dateKeySchema }))
    .max(100),
});
export const settingsSchema = z.object({
  household: z.string().trim().min(1).max(60),
  timezone: z
    .string()
    .max(80)
    .refine((s) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: s });
        return true;
      } catch {
        return false;
      }
    }, "Invalid time zone"),
  location: z.object({
    name: z.string().trim().min(1).max(80),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  calendars: z
    .array(calendarSchema)
    .max(12)
    .refine(
      (cs) => new Set(cs.map((c) => c.id)).size === cs.length,
      "Calendar IDs must be unique",
    ),
  schedules: z
    .array(scheduleSchema)
    .length(2)
    .refine(
      (ss) => new Set(ss.map((s) => s.id)).size === 2,
      "Use one trash and one recycling schedule",
    ),
  night: z.object({
    start: timeSchema,
    end: timeSchema,
    solar: z.boolean(),
    override: z.enum(["auto", "day", "night"]),
    overrideUntil: z.string().datetime().nullable(),
  }),
});
export const itemSchema = z.object({
  list: z.enum(["grocery", "todo"]),
  text: z.string().trim().min(1).max(160),
  category: z.string().trim().max(40).default(""),
  priority: z.enum(["normal", "high"]).default("normal"),
  due: dateKeySchema.nullable().default(null),
  completed: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type Item = z.infer<typeof itemSchema> & { id: string; version: number };
export type CalendarEvent = {
  id: string;
  uid: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
};
export type Weather = {
  current: { temperature: number; feelsLike: number; code: number };
  hourly: { time: string; temperature: number; rain: number; code: number }[];
  daily: {
    date: string;
    high: number;
    low: number;
    code: number;
    sunrise: string;
    sunset: string;
  }[];
};
export type Alert = {
  id: string;
  title: string;
  severity: string;
  description: string;
  expires: string;
};
export type SyncState = { lastSuccess: string | null; error: string | null };
export type Snapshot = {
  demo: boolean;
  settings: Settings;
  items: Item[];
  events: CalendarEvent[];
  weather: Weather | null;
  alerts: Alert[];
  sync: { calendar: SyncState; weather: SyncState; alerts: SyncState };
  calendarRange: { start: string; end: string };
};
export const defaultSettings: Settings = {
  household: "Our little corner of the world",
  timezone: "America/New_York",
  location: { name: "Centreville, VA", latitude: 38.8404, longitude: -77.4289 },
  calendars: [
    {
      id: "person1",
      name: "Alex",
      color: "#788bb5",
      kind: "personal",
      upcoming: true,
    },
    {
      id: "person2",
      name: "Jamie",
      color: "#c18c6c",
      kind: "personal",
      upcoming: true,
    },
    {
      id: "home",
      name: "Together",
      color: "#779782",
      kind: "household",
      upcoming: true,
    },
    {
      id: "birthdays",
      name: "Celebrations",
      color: "#ad89ae",
      kind: "birthday",
      upcoming: true,
    },
  ],
  schedules: [
    {
      id: "trash",
      label: "Trash",
      anchor: "2026-01-06",
      rule: "FREQ=WEEKLY;BYDAY=TU,FR",
      skips: [],
      overrides: [],
    },
    {
      id: "recycling",
      label: "Recycling",
      anchor: "2026-01-08",
      rule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TH",
      skips: [],
      overrides: [],
    },
  ],
  night: {
    start: "22:00",
    end: "06:30",
    solar: false,
    override: "auto",
    overrideUntil: null,
  },
};
