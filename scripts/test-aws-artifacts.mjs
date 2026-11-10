import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { handler } = require("../dist-aws/api.js");
const { runSync } = require("../dist-aws/sync.js");
process.env.TABLE_NAME = "artifact-test";
process.env.APP_ORIGIN = "https://test.example.com";
const response = await handler({
  rawPath: "/api/health",
  headers: {},
  requestContext: { http: { method: "GET" } },
});
assert.equal(response.statusCode, 200);
const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  assert.equal(String(url), "https://calendar.google.com/test.ics");
  return new Response(
    `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:artifact-test\r\nDTSTART;TZID=America/New_York:${date}T120000\r\nDTEND;TZID=America/New_York:${date}T130000\r\nRRULE:FREQ=DAILY;COUNT=2\r\nSUMMARY:Artifact fixture\r\nEND:VEVENT\r\nEND:VCALENDAR`,
    { headers: { "Content-Type": "text/calendar" } },
  );
};
try {
  // Weather URLs intentionally fail the stub; calendar parsing must still work.
  const settings = {
    household: "Test",
    timezone: "America/New_York",
    location: { name: "Test", latitude: 38, longitude: -77 },
    calendars: [
      {
        id: "test",
        name: "Test",
        color: "#112233",
        kind: "personal",
        upcoming: true,
      },
    ],
    schedules: [],
    night: {
      start: "22:00",
      end: "06:00",
      solar: false,
      override: "auto",
      overrideUntil: null,
    },
  };
  let published;
  await runSync({
    settings: async () => settings,
    secrets: async () => ({
      feeds: { test: "https://calendar.google.com/test.ics" },
      userAgent: "Test",
    }),
    acquireLease: async () => true,
    releaseLease: async () => {},
    read: async () => null,
    publish: async (_cache, value) => {
      published = value;
    },
  });
  assert.equal(
    published.snapshot.events.length,
    2,
    "Bundled node-ical timezone/recurrence dependencies must work",
  );
  assert.equal(published.snapshot.sync.calendar.error, null);
  assert.notEqual(published.snapshot.sync.weather.error, null);
  console.log(
    "Lambda artifacts loaded; API health and timezone-aware recurring calendar sync passed without AWS/network access.",
  );
} finally {
  globalThis.fetch = originalFetch;
}
