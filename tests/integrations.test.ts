import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/database";
import {
  Integrations,
  fetchAlerts,
  fetchWeather,
} from "../server/integrations";
import { defaultSettings } from "../shared/model";
const weatherPayload = {
  current: { temperature_2m: 64, apparent_temperature: 62, weather_code: 2 },
  hourly: {
    time: [1794229200],
    temperature_2m: [64],
    precipitation_probability: [55],
    weather_code: [61],
  },
  daily: {
    time: [1794200400],
    temperature_2m_max: [68],
    temperature_2m_min: [45],
    weather_code: [2],
    sunrise: [1794228000],
    sunset: [1794262800],
  },
};
test("weather adapters normalize real provider contracts and preserve probability", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request) =>
      new Response(
        JSON.stringify(
          String(input).includes("open-meteo")
            ? weatherPayload
            : {
                features: [
                  {
                    id: "alert-1",
                    properties: {
                      headline: "Wind advisory",
                      event: "Wind",
                      severity: "Moderate",
                      description: "Secure loose objects.",
                      expires: "2099-01-01T00:00:00Z",
                    },
                  },
                ],
              },
        ),
        { status: 200 },
      ),
  );
  const weather = await fetchWeather(defaultSettings);
  assert.equal(weather.hourly[0].rain, 55);
  assert.equal(weather.current.feelsLike, 62);
  const alerts = await fetchAlerts(defaultSettings, "test");
  assert.equal(alerts[0].title, "Wind advisory");
});
test("provider failures preserve cached data, back off, and recover without fake data", async (t) => {
  const store = new Store(":memory:");
  const settings = store.settings();
  settings.calendars = [];
  store.set("settings", settings);
  let fail = false;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    calls++;
    if (fail) throw new Error("Network disconnected with secret detail");
    return new Response(
      JSON.stringify(
        String(input).includes("open-meteo")
          ? weatherPayload
          : { features: [] },
      ),
      { status: 200 },
    );
  });
  const integrations = new Integrations(store, false, {}, "test");
  try {
    await integrations.sync();
    assert.equal(calls, 2);
    const first = integrations.snapshot();
    assert.equal(first.weather?.current.temperature, 64);
    fail = true;
    integrations.invalidate();
    await integrations.sync();
    const stale = integrations.snapshot();
    assert.deepEqual(stale.weather, first.weather);
    assert.equal(
      stale.sync.weather.lastSuccess,
      first.sync.weather.lastSuccess,
    );
    assert.ok(stale.sync.weather.error);
    assert.equal(stale.sync.weather.error.includes("secret"), false);
    const before = calls;
    await integrations.sync();
    assert.equal(calls, before);
    fail = false;
    integrations.invalidate();
    await integrations.sync();
    assert.equal(integrations.snapshot().sync.weather.error, null);
  } finally {
    store.close();
  }
});
test("missing private feeds remain visibly unconfigured; no synthetic events leak into live mode", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("offline");
  });
  const store = new Store(":memory:");
  try {
    const integrations = new Integrations(store, false, {}, "test");
    await integrations.sync();
    const snapshot = integrations.snapshot();
    assert.equal(snapshot.demo, false);
    assert.equal(snapshot.events.length, 0);
    assert.equal(snapshot.weather, null);
    assert.ok(snapshot.sync.calendar.error);
  } finally {
    store.close();
  }
});
test("Google fetch uses validators and re-expands cached ICS on 304", async (t) => {
  const store = new Store(":memory:");
  const settings = store.settings();
  settings.calendars = [settings.calendars[0]];
  store.set("settings", settings);
  let feedCalls = 0;
  const year = new Date().getUTCFullYear();
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:annual\r\nDTSTART;VALUE=DATE:${year}0101\r\nDTEND;VALUE=DATE:${year}0102\r\nRRULE:FREQ=DAILY;COUNT=366\r\nSUMMARY:Daily reminder\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("calendar.google.com")) {
        feedCalls++;
        if (feedCalls === 2) {
          assert.equal(
            new Headers(init?.headers).get("if-none-match"),
            "feed-v1",
          );
          return new Response(null, { status: 304 });
        }
        return new Response(ics, { headers: { etag: "feed-v1" } });
      }
      return new Response(
        JSON.stringify(
          String(input).includes("open-meteo")
            ? weatherPayload
            : { features: [] },
        ),
      );
    },
  );
  try {
    const integrations = new Integrations(
      store,
      false,
      {
        person1:
          "https://calendar.google.com/calendar/ical/test/private-test/basic.ics",
      },
      "test",
    );
    await integrations.sync();
    const events = integrations.snapshot().events;
    assert.ok(events.length > 0);
    integrations.invalidate();
    await integrations.sync();
    assert.equal(feedCalls, 2);
    assert.deepEqual(integrations.snapshot().events, events);
  } finally {
    store.close();
  }
});

test("a location change discards an in-flight forecast from the previous location", async (t) => {
  const store = new Store(":memory:");
  const settings = store.settings();
  settings.calendars = [];
  store.set("settings", settings);
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let weatherCalls = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    if (!String(input).includes("open-meteo"))
      return new Response(JSON.stringify({ features: [] }));
    weatherCalls++;
    if (weatherCalls === 1) await waiting;
    return new Response(
      JSON.stringify({
        ...weatherPayload,
        current: {
          ...weatherPayload.current,
          temperature_2m: weatherCalls === 1 ? 64 : 80,
        },
      }),
    );
  });
  const integrations = new Integrations(store, false, {}, "test");
  try {
    const oldSync = integrations.sync();
    store.set("settings", {
      ...settings,
      location: { ...settings.location, name: "New location", latitude: 35 },
    });
    release();
    await oldSync;
    assert.equal(integrations.snapshot().weather, null);
    await integrations.sync();
    assert.equal(integrations.snapshot().weather?.current.temperature, 80);
    assert.equal(integrations.snapshot().settings.location.latitude, 35);
  } finally {
    release();
    store.close();
  }
});
