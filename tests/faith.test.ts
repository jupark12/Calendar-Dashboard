import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { Store } from "../server/database";
import { createApp } from "../server/app";
import { Integrations } from "../server/integrations";
import {
  faithStats,
  faithStreak,
  faithWeekStart,
  type FaithEntry,
} from "../shared/faith";
import { addDays, dateKey } from "../shared/time";

test("Faith scoring uses household calendar boundaries and unique activity days", () => {
  const today = dateKey(new Date("2026-11-10T02:00:00Z"), "America/New_York");
  assert.equal(today, "2026-11-09");
  assert.equal(faithWeekStart(today), "2026-11-09");
  assert.equal(faithWeekStart("2027-01-01"), "2026-12-28");
  const entry = (
    date: string,
    person: "jun" | "soobin" = "jun",
    kind: "reading" | "prayer" = "reading",
    amount = 1,
  ): FaithEntry => ({
    id: randomUUID(),
    date,
    person,
    kind,
    amount,
    note: "",
    createdAt: "2026-11-10T12:00:00Z",
  });
  const rows = [
    entry("2026-11-08"),
    entry("2026-11-09"),
    entry("2026-11-09", "jun", "prayer", 5),
    entry("2026-11-09", "soobin", "reading", 3),
  ];
  assert.deepEqual(faithStats(rows, "jun", faithWeekStart(today), today), {
    reading: 1,
    prayer: 5,
    xp: 20,
  });
  assert.equal(faithStats(rows, "jun").xp, 30);
  assert.equal(faithStats(rows, "soobin").xp, 30);
  assert.equal(faithStreak(rows, "jun", "2026-11-10"), 2);
  assert.equal(faithStreak(rows, "jun", "2026-11-11"), 0);
});

test("Faith API shares durable entries, allows display edits, validates dates, and rejects stale goals", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hq-faith-"));
  const path = join(dir, "test.sqlite");
  const store = new Store(path);
  const origin = "http://localhost:3000";
  const app = createApp(store, new Integrations(store, true, {}, "Tests"), {
    demo: false,
    origin,
    secure: false,
    adminPassword: "test-admin-password",
    displayPassword: "test-display-password",
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
    originHeader = origin,
  ) =>
    fetch(base + path, {
      method,
      headers: {
        Cookie: cookie,
        Origin: originHeader,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const login = async (role: "admin" | "display") =>
    (
      await request("/login", "POST", {
        role,
        password: `test-${role}-password`,
      })
    ).headers
      .get("set-cookie")!
      .split(";")[0];
  try {
    assert.equal((await request("/faith")).status, 401);
    const display = await login("display"),
      admin = await login("admin");
    assert.equal(
      (await request("/faith", "GET", undefined, display)).status,
      200,
    );
    const today = dateKey(new Date(), store.settings().timezone);
    const input = {
      id: randomUUID(),
      person: "jun",
      kind: "reading",
      amount: 2,
      date: today,
      note: "John 1–2",
    };
    assert.equal(
      (await request("/faith/entries", "POST", input, display)).status,
      201,
    );
    assert.equal(
      (
        await request(
          "/faith/entries",
          "POST",
          input,
          admin,
          "https://evil.example",
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("/faith/entries", "POST", { ...input, amount: -1 }, admin))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          "/faith/entries",
          "POST",
          { ...input, date: addDays(today, 1) },
          admin,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/faith/entries",
          "POST",
          { ...input, date: "2026-02-31" },
          admin,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request("/faith/entries", "POST", input, admin)).status,
      201,
    );
    assert.equal(
      (await request("/faith/entries", "POST", input, admin)).status,
      201,
    );
    assert.equal(
      (await request("/faith/entries", "POST", { ...input, amount: 3 }, admin))
        .status,
      409,
    );
    const other = {
      ...input,
      id: randomUUID(),
      person: "soobin",
      kind: "prayer",
      amount: 5,
    };
    await request("/faith/entries", "POST", other, admin);
    const shared = await (
      await request("/faith", "GET", undefined, display)
    ).json();
    assert.equal(shared.entries.length, 2);
    assert.equal(
      (
        await request(
          "/faith/goals",
          "PUT",
          { reading: 2, prayer: 10, version: 0 },
          display,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/faith/goals",
          "PUT",
          { reading: 3, prayer: 15, version: 0 },
          admin,
        )
      ).status,
      409,
    );
    const reader = new Store(path);
    assert.equal(reader.faithEntries().length, 2);
    assert.deepEqual(reader.faithGoals(), {
      reading: 2,
      prayer: 10,
      version: 1,
    });
    reader.close();
    assert.equal(
      (await request(`/faith/entries/${input.id}`, "DELETE", {}, display))
        .status,
      200,
    );
    assert.equal(
      (await request(`/faith/entries/${input.id}`, "DELETE", {}, admin)).status,
      200,
    );
    assert.equal(store.faithEntries().length, 1);
    assert.equal(store.faithEntries()[0].person, "soobin");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
