import { test } from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { createHandler } from "../aws/api";
import { defaultSettings, itemSchema, type Item } from "../shared/model";
import {
  Conflict,
  IntegrationMemory,
  fingerprint,
  hash,
  type Repository,
  type Secrets,
  type Session,
  type Published,
} from "../aws/model";
import { Integrations } from "../server/integrations";
import { runSync, type SavedCache } from "../aws/sync";
import { DynamoRepository } from "../aws/repository";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
const config: Secrets = {
  adminPassword: "admin-password-for-tests-only",
  displayPassword: "display-password-for-tests-only",
  feeds: {},
  userAgent: "Tests",
};
const origin = "https://home-hq.example.com";
function fixture() {
  let settings = structuredClone(defaultSettings);
  const items = new Map<string, Item>();
  const sessions = new Map<string, Session>();
  let attempts = 0;
  let published: Published | null = null;
  const repo: Repository = {
    settings: async () => settings,
    saveSettings: async (value, previous) => {
      if (JSON.stringify(settings) !== previous) throw new Conflict();
      settings = value;
    },
    items: async () => [...items.values()],
    add: async (body) => {
      const item = { ...body, id: "test-id", version: 1 };
      items.set(item.id, item);
      return item;
    },
    update: async (id, version, body) => {
      if (items.get(id)?.version !== version) throw new Conflict();
      items.set(id, { ...body, id, version: version + 1 });
    },
    remove: async (id, version) => {
      if (items.get(id)?.version !== version) throw new Conflict();
      items.delete(id);
    },
    session: async (token) => sessions.get(token) ?? null,
    saveSession: async (token, value) => {
      sessions.set(token, value);
    },
    removeSession: async (token) => {
      sessions.delete(token);
    },
    allowLogin: async () => ++attempts <= 10,
  };
  const deps = {
    repo,
    secrets: async () => config,
    published: async () => published,
    origin,
  };
  const handler = createHandler(deps);
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    cookie?: string,
    headers: Record<string, string> = {},
  ) =>
    handler({
      rawPath: "/api" + path,
      requestContext: { http: { method } },
      headers: { origin, "content-type": "application/json", ...headers },
      cookies: cookie ? [cookie] : [],
      body: body === undefined ? undefined : JSON.stringify(body),
      isBase64Encoded: false,
    } as unknown as APIGatewayProxyEventV2);
  const login = async (role: "admin" | "display") => {
    const response = await request("/login", "POST", {
      role,
      password:
        role === "admin" ? config.adminPassword : config.displayPassword,
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.cookies![0], /HttpOnly; Secure; SameSite=Strict/);
    return response.cookies![0].split(";")[0];
  };
  return {
    repo,
    sessions,
    request,
    login,
    setPublished(value: Published) {
      published = value;
    },
  };
}
test("Lambda auth, same-origin boundary, expired sessions, logout, and password rotation", async () => {
  const f = fixture();
  assert.equal((await f.request("/dashboard")).statusCode, 401);
  assert.equal(
    (
      await f.request(
        "/login",
        "POST",
        { role: "admin", password: config.adminPassword },
        undefined,
        { origin: "https://evil.example" },
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await f.request("/login", "POST", {}, undefined, {
        "content-type": "text/plain",
      })
    ).statusCode,
    415,
  );
  assert.equal(
    (await f.request("/login", "POST", { role: "admin", password: "wrong" }))
      .statusCode,
    401,
  );
  const cookie = await f.login("display");
  assert.equal(
    (await f.request("/dashboard", "GET", undefined, cookie)).statusCode,
    200,
  );
  assert.equal(
    (await f.request("/items", "POST", { list: "todo", text: "x" }, cookie))
      .statusCode,
    403,
  );
  const key = hash(cookie.slice("hq_session=".length));
  const session = f.sessions.get(key)!;
  f.sessions.set(key, { ...session, expires: 1 });
  assert.equal(
    (await f.request("/dashboard", "GET", undefined, cookie)).statusCode,
    401,
  );
  f.sessions.set(key, { ...session, credential: hash("previous-password") });
  assert.equal(
    (await f.request("/dashboard", "GET", undefined, cookie)).statusCode,
    401,
  );
  f.sessions.set(key, session);
  assert.equal(
    (await f.request("/logout", "POST", {}, cookie)).statusCode,
    200,
  );
  assert.equal(f.sessions.has(key), false);
});
test("Lambda list/settings conflicts, validation and conditional dashboard responses", async () => {
  const f = fixture();
  const cookie = await f.login("admin");
  const input = { list: "grocery", text: "Apples" };
  const created = await f.request("/items", "POST", input, cookie);
  assert.equal(created.statusCode, 201);
  assert.equal(
    (
      await f.request(
        "/items/test-id",
        "PUT",
        { ...input, text: "Pears", version: 1 },
        cookie,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (await f.request("/items/test-id", "PUT", { ...input, version: 1 }, cookie))
      .statusCode,
    409,
  );
  assert.equal(
    (await f.request("/items/test-id", "DELETE", { version: 1 }, cookie))
      .statusCode,
    409,
  );
  assert.equal(
    (await f.request("/items/test-id", "DELETE", { version: 2 }, cookie))
      .statusCode,
    200,
  );
  assert.equal(
    (await f.request("/items", "POST", { list: "invalid" }, cookie)).statusCode,
    400,
  );
  const settings = await f.repo.settings();
  assert.equal(
    (
      await f.request(
        "/settings",
        "PUT",
        {
          settings: { ...settings, household: "Cloud home" },
          previous: JSON.stringify(settings),
        },
        cookie,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await f.request(
        "/settings",
        "PUT",
        { settings, previous: JSON.stringify(settings) },
        cookie,
      )
    ).statusCode,
    409,
  );
  const badRule = structuredClone(settings);
  badRule.schedules[0].rule = "FREQ=SECONDLY";
  assert.equal(
    (
      await f.request(
        "/settings",
        "PUT",
        {
          settings: badRule,
          previous: JSON.stringify(await f.repo.settings()),
        },
        cookie,
      )
    ).statusCode,
    400,
  );
  const dashboard = await f.request("/dashboard", "GET", undefined, cookie);
  assert.equal(dashboard.headers!["Cache-Control"], "private, no-store");
  const etag = String(dashboard.headers!.ETag);
  assert.equal(
    (
      await f.request("/dashboard", "GET", undefined, cookie, {
        "if-none-match": etag,
      })
    ).statusCode,
    304,
  );
});
test("Lambda ignores cached data from a different location and expires alerts at read time", async () => {
  const f = fixture();
  const cookie = await f.login("display");
  const settings = await f.repo.settings();
  const snapshot = new Integrations(
    new IntegrationMemory(settings),
    false,
    {},
    "Tests",
  ).snapshot();
  snapshot.events = [
    {
      id: "event",
      uid: "uid",
      calendarId: settings.calendars[0].id,
      title: "Test",
      start: "2026-11-01T12:00:00Z",
      end: "2026-11-01T13:00:00Z",
      allDay: false,
    },
  ];
  snapshot.alerts = [
    {
      id: "old",
      title: "Expired",
      description: "",
      severity: "Minor",
      expires: "2000-01-01T00:00:00Z",
    },
  ];
  f.setPublished({ fingerprint: fingerprint(settings, config), snapshot });
  const read = async () =>
    JSON.parse((await f.request("/dashboard", "GET", undefined, cookie)).body!);
  assert.equal((await read()).events.length, 1);
  assert.equal((await read()).alerts.length, 0);
  await f.repo.saveSettings(
    { ...settings, household: "Renamed" },
    JSON.stringify(settings),
  );
  assert.equal((await read()).events.length, 1);
  const current = await f.repo.settings();
  await f.repo.saveSettings(
    { ...current, location: { ...current.location, latitude: 1 } },
    JSON.stringify(current),
  );
  assert.equal((await read()).events.length, 0);
});
test("Lambda login limit survives separate handler instances through the repository", async () => {
  const f = fixture();
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await f.request("/login", "POST", { role: "admin", password: "wrong" }))
        .statusCode,
      401,
    );
  const handler = createHandler({
    repo: f.repo,
    origin,
    secrets: async () => config,
    published: async () => null,
  });
  assert.equal(
    (
      await handler({
        rawPath: "/api/login",
        requestContext: { http: { method: "POST" } },
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ role: "admin", password: config.adminPassword }),
      } as unknown as APIGatewayProxyEventV2)
    ).statusCode,
    429,
  );
});
test("Sync lease, settings race, persisted cache and lease release on failure", async () => {
  let settings = structuredClone(defaultSettings);
  let lease = true;
  let released = 0;
  let publishes = 0;
  let saved: SavedCache | null = null;
  const deps = {
    settings: async () => settings,
    secrets: async () => config,
    acquireLease: async () => lease,
    releaseLease: async () => {
      released++;
    },
    read: async () => saved,
    publish: async (cache: SavedCache) => {
      saved = cache;
      publishes++;
    },
    refresh: async (_i: Integrations) => {},
  };
  lease = false;
  assert.deepEqual(await runSync(deps), { skipped: true });
  assert.equal(released, 0);
  lease = true;
  assert.deepEqual(await runSync(deps), { ok: true });
  assert.equal(publishes, 1);
  assert.equal(released, 1);
  await runSync({
    ...deps,
    refresh: async () => {
      settings = { ...settings, household: "Changed mid-sync" };
    },
  });
  assert.equal(publishes, 1);
  assert.equal(released, 2);
  await assert.rejects(
    runSync({
      ...deps,
      publish: async () => {
        throw new Error("storage offline");
      },
    }),
    /sync failed/,
  );
  assert.equal(released, 3);
});
test("DynamoDB uses atomic item/settings conditions, paginates lists, and rejects stale leases", async (t) => {
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: "us-east-1" }),
  );
  const repo = new DynamoRepository("test", client);
  const commands: { input: Record<string, unknown> }[] = [];
  const failure = Object.assign(new Error("conflict"), {
    name: "ConditionalCheckFailedException",
  });
  t.mock.method(
    client,
    "send",
    async (command: { input: Record<string, unknown> }) => {
      commands.push(command);
      throw failure;
    },
  );
  await assert.rejects(
    repo.update("id", 2, itemSchema.parse({ list: "todo", text: "Test" })),
    Conflict,
  );
  assert.equal(
    commands[0].input.ConditionExpression,
    "#data.#version = :version",
  );
  await assert.rejects(repo.remove("id", 2), Conflict);
  await assert.rejects(repo.saveSettings(defaultSettings, "prior"), Conflict);
  assert.equal(commands[2].input.ConditionExpression, "#data = :previous");
  assert.equal(await repo.acquireLease("owner"), false);
  await repo.releaseLease("different-owner");
  t.mock.restoreAll();
  let pages = 0;
  t.mock.method(
    client,
    "send",
    async (command: { input: Record<string, unknown> }) => {
      pages++;
      assert.equal(command.input.ConsistentRead, true);
      if (pages === 1)
        return {
          Items: [{ data: { id: "a" } }],
          LastEvaluatedKey: { pk: "home", sk: "item:a" },
        };
      assert.deepEqual(command.input.ExclusiveStartKey, {
        pk: "home",
        sk: "item:a",
      });
      return { Items: [{ data: { id: "b" } }] };
    },
  );
  assert.equal((await repo.items()).length, 2);
});
