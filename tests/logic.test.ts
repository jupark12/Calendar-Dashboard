import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, settingsSchema } from "../shared/model";
import { addDays, dateKey, eventOnDay, nightActive } from "../shared/time";
import { nextPickup, parseRule } from "../server/scheduling";
import { deduplicate, parseCalendar } from "../server/integrations";
const range = { start: "2026-03-01", end: "2026-03-31" };
const ics = (events: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//HomeHQ//Tests//EN\r\n${events}\r\nEND:VCALENDAR`;
const event = (body: string) => `BEGIN:VEVENT\r\n${body}\r\nEND:VEVENT`;
test("date keys follow household time zone, not UTC", () => {
  assert.equal(
    dateKey("2026-03-08T02:00:00Z", "America/New_York"),
    "2026-03-07",
  );
  assert.equal(addDays("2026-03-08", 1), "2026-03-09");
});
test("all-day end is exclusive across multiple days", () => {
  const e = {
    id: "1",
    uid: "1",
    title: "Trip",
    calendarId: "home",
    start: "2026-03-07",
    end: "2026-03-10",
    allDay: true,
  };
  assert.equal(eventOnDay(e, "2026-03-09", "America/New_York"), true);
  assert.equal(eventOnDay(e, "2026-03-10", "America/New_York"), false);
});
test("timed event ending at midnight does not spill into next day", () => {
  const e = {
    id: "1",
    uid: "1",
    title: "Late",
    calendarId: "home",
    start: "2026-03-08T03:00:00Z",
    end: "2026-03-08T05:00:00Z",
    allDay: false,
  };
  assert.equal(eventOnDay(e, "2026-03-08", "America/New_York"), false);
});
test("night schedule spans midnight and expires overrides", () => {
  const s = structuredClone(defaultSettings);
  assert.equal(nightActive(s, new Date("2026-11-09T04:00Z"), null), true);
  assert.equal(nightActive(s, new Date("2026-11-09T17:00Z"), null), false);
  s.night.override = "day";
  s.night.overrideUntil = "2026-11-09T05:00:00Z";
  assert.equal(nightActive(s, new Date("2026-11-09T04:00Z"), null), false);
  assert.equal(nightActive(s, new Date("2026-11-09T06:00Z"), null), true);
});
test("equal day/night times disable scheduled night", () => {
  const s = structuredClone(defaultSettings);
  s.night.start = s.night.end;
  assert.equal(nightActive(s, new Date(), null), false);
});
test("solar mode uses today’s sunset and falls back for stale dates", () => {
  const s = structuredClone(defaultSettings);
  s.night.solar = true;
  const weather = {
    current: { temperature: 60, feelsLike: 60, code: 0 },
    hourly: [],
    daily: [
      {
        date: "2026-11-09",
        sunrise: "2026-11-09T12:00Z",
        sunset: "2026-11-09T22:00Z",
        high: 65,
        low: 40,
        code: 0,
      },
    ],
  };
  assert.equal(nightActive(s, new Date("2026-11-09T23:00Z"), weather), true);
  assert.equal(nightActive(s, new Date("2026-11-10T17:00Z"), weather), false);
});
test("biweekly schedule is anchored and applies skip/holiday overrides", () => {
  const s = {
    id: "recycling" as const,
    label: "Recycling",
    anchor: "2026-03-05",
    rule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TH",
    skips: [],
    overrides: [],
  };
  assert.equal(nextPickup(s, "2026-03-06"), "2026-03-19");
  assert.equal(
    nextPickup({ ...s, skips: ["2026-03-19"] }, "2026-03-06"),
    "2026-04-02",
  );
  assert.equal(
    nextPickup(
      { ...s, overrides: [{ from: "2026-03-19", to: "2026-03-20" }] },
      "2026-03-19",
    ),
    "2026-03-20",
  );
});
test("monthly custom rule and ended schedules", () => {
  const s = {
    ...defaultSettings.schedules[0],
    anchor: "2026-01-01",
    rule: "FREQ=MONTHLY;BYDAY=1MO",
  };
  assert.equal(nextPickup(s, "2026-03-02"), "2026-03-02");
  assert.equal(
    nextPickup({ ...s, rule: "FREQ=WEEKLY;COUNT=1" }, "2026-03-02"),
    null,
  );
  assert.throws(() => parseRule({ ...s, rule: "FREQ=SECONDLY" }));
});
test("settings reject invalid dates and duplicate schedules", () => {
  const s = structuredClone(defaultSettings);
  s.schedules[0].anchor = "2026-02-30";
  assert.equal(settingsSchema.safeParse(s).success, false);
  s.schedules = [defaultSettings.schedules[0], defaultSettings.schedules[0]];
  assert.equal(settingsSchema.safeParse(s).success, false);
});
test("recurrences stay at 9 AM through DST and honor EXDATE", async () => {
  const data = ics(
    event(
      "UID:weekly\r\nDTSTART;TZID=America/New_York:20260301T090000\r\nDTEND;TZID=America/New_York:20260301T100000\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\nEXDATE;TZID=America/New_York:20260315T090000\r\nSUMMARY:Breakfast",
    ),
  );
  const events = await parseCalendar(data, "home", range);
  assert.equal(events.length, 3);
  assert.equal(events[0].start, "2026-03-01T14:00:00.000Z");
  assert.equal(events[1].start, "2026-03-08T13:00:00.000Z");
});
test("cancelled and moved recurrence instances replace the originals", async () => {
  const data = ics(
    [
      event(
        "UID:r\r\nDTSTART;TZID=America/New_York:20260301T090000\r\nDTEND;TZID=America/New_York:20260301T100000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:Original",
      ),
      event(
        "UID:r\r\nRECURRENCE-ID;TZID=America/New_York:20260308T090000\r\nDTSTART;TZID=America/New_York:20260308T090000\r\nDTEND;TZID=America/New_York:20260308T100000\r\nSTATUS:CANCELLED",
      ),
      event(
        "UID:r\r\nRECURRENCE-ID;TZID=America/New_York:20260315T090000\r\nDTSTART;TZID=America/New_York:20260316T110000\r\nDTEND;TZID=America/New_York:20260316T120000\r\nSUMMARY:Moved",
      ),
    ].join("\r\n"),
  );
  const events = await parseCalendar(data, "home", range);
  assert.equal(events.length, 2);
  assert.equal(events[1].title, "Moved");
  assert.equal(events[1].start, "2026-03-16T15:00:00.000Z");
});
test("all-day recurring birthdays and duplicate UIDs", async () => {
  const data = ics(
    event(
      "UID:birthday\r\nDTSTART;VALUE=DATE:20000309\r\nDTEND;VALUE=DATE:20000310\r\nRRULE:FREQ=YEARLY\r\nSUMMARY:Birthday",
    ),
  );
  const events = await parseCalendar(data, "birthdays", range);
  assert.equal(events[0].start, "2026-03-09");
  assert.equal(events[0].end, "2026-03-10");
  assert.equal(events[0].allDay, true);
  assert.equal(
    deduplicate([
      ...events,
      ...events.map((e) => ({ ...e, calendarId: "home" })),
    ]).length,
    1,
  );
});
test("ongoing multi-day event overlaps the sync window", async () => {
  const events = await parseCalendar(
    ics(
      event(
        "UID:trip\r\nDTSTART;VALUE=DATE:20260227\r\nDTEND;VALUE=DATE:20260303\r\nSUMMARY:Trip",
      ),
    ),
    "home",
    range,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].end, "2026-03-03");
});
