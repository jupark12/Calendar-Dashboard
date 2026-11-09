import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { Store } from "../server/database";
import { createApp } from "../server/app";
import { Integrations } from "../server/integrations";
const origin = "http://localhost:3000";
test("authentication, role boundaries, CSRF, list conflicts, persistence, and settings", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hq-test-"));
  const path = join(dir, "test.sqlite");
  const store = new Store(path);
  const app = createApp(store, new Integrations(store, true, {}, "tests"), {
    demo: false,
    origin,
    secure: false,
    adminPassword: "admin-test-password-123456",
    displayPassword: "display-test-password-123456",
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
    requestOrigin = origin,
  ) {
    return fetch(base + "/api" + path, {
      method,
      headers: {
        Origin: requestOrigin,
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  try {
    assert.equal((await request("/dashboard")).status, 401);
    assert.equal(
      (await request("/login", "POST", { role: "admin", password: "wrong" }))
        .status,
      401,
    );
    const d = await request("/login", "POST", {
      role: "display",
      password: "display-test-password-123456",
    });
    assert.equal(d.status, 200);
    const dc = d.headers.get("set-cookie")!.split(";")[0];
    assert.match(d.headers.get("set-cookie")!, /HttpOnly/);
    assert.equal(
      (await request("/dashboard", "GET", undefined, dc)).status,
      200,
    );
    assert.equal(
      (await request("/items", "POST", { list: "todo", text: "Bad" }, dc))
        .status,
      403,
    );
    const a = await request("/login", "POST", {
      role: "admin",
      password: "admin-test-password-123456",
    });
    const ac = a.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (
        await request(
          "/items",
          "POST",
          { list: "todo", text: "Forged" },
          ac,
          "https://evil.example",
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("/items", "POST", { list: "todo", text: "" }, ac)).status,
      400,
    );
    const added = await request(
      "/items",
      "POST",
      { list: "todo", text: "Buy filters", category: "Home" },
      ac,
    );
    assert.equal(added.status, 201);
    const item = await added.json();
    assert.equal(
      (
        await request(
          "/items/" + item.id,
          "PUT",
          { ...item, completed: true },
          ac,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request("/items/" + item.id, "PUT", item, ac)).status,
      409,
    );
    assert.equal(
      (await request("/items/" + item.id, "DELETE", { version: 1 }, ac)).status,
      409,
    );
    const reader = new Store(path);
    assert.equal(reader.items()[0].completed, true);
    reader.close();
    const snap = await (
      await request("/dashboard", "GET", undefined, ac)
    ).json();
    assert.equal(JSON.stringify(snap).includes("CALENDAR_FEEDS"), false);
    const settings = { ...snap.settings, household: "Test house" };
    assert.equal(
      (
        await request(
          "/settings",
          "PUT",
          { settings, previous: JSON.stringify(snap.settings) },
          ac,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/settings",
          "PUT",
          { settings, previous: JSON.stringify(snap.settings) },
          ac,
        )
      ).status,
      409,
    );
    assert.equal(
      (await request("/items/" + item.id, "DELETE", { version: 2 }, ac)).status,
      200,
    );
    await request("/logout", "POST", {}, ac);
    assert.equal(
      (await request("/dashboard", "GET", undefined, ac)).status,
      401,
    );
    const first = await request("/dashboard", "GET", undefined, dc);
    const etag = first.headers.get("etag");
    assert.ok(etag);
    const unchanged = await fetch(base + "/api/dashboard", {
      headers: { Cookie: dc, "If-None-Match": etag! },
    });
    assert.equal(unchanged.status, 304);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
