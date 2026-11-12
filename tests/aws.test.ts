import {
  defaultFaithGoals,
  sameFaithEntry,
  type FaithEntry,
} from "../shared/faith";
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
  const faith = new Map<string, FaithEntry>();
  let goals = { ...defaultFaithGoals };
  const sessions = new Map<string, Session>();
  const photos = new Map<string, Buffer>();
  let attempts = 0;
  let published: Published | null = null;
  const repo: Repository = {
    faithEntries: async () => [...faith.values()],
    faithGoals: async () => goals,
    addFaith: async (input) => {
      const saved = faith.get(input.id);
      if (saved && !sameFaithEntry(saved, input)) throw new Conflict();
      const entry = saved ?? { ...input, createdAt: new Date().toISOString() };
      faith.set(entry.id, entry);
      return entry;
    },
    removeFaith: async (id) => {
      faith.delete(id);
    },
    saveFaithGoals: async (input) => {
      if (goals.version !== input.version) throw new Conflict();
      goals = { ...input, version: input.version + 1 };
      return goals;
    },
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
    photos: {
      list: async () => [...photos.keys()],
      get: async (id: string) => photos.get(id) ?? null,
      add: async (id: string, image: Buffer) => {
        if (photos.size >= 100) return false;
        photos.set(id, image);
        return true;
      },
      remove: async (id: string) => photos.delete(id),
    },
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
    photos,
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
test("Lambda photo access and private image responses", async () => {
  const f = fixture();
  const display = await f.login("display");
  const admin = await f.login("admin");
  const data = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");
  assert.equal(
    (await f.request("/photos", "POST", { data }, display)).statusCode,
    403,
  );
  const added = await f.request("/photos", "POST", { data }, admin);
  assert.equal(added.statusCode, 201);
  const { id } = JSON.parse(added.body!);
  const listing = await f.request("/photos", "GET", undefined, display);
  assert.equal(JSON.parse(listing.body!).photos.length, 1);
  const image = await f.request(`/photos/${id}`, "GET", undefined, display);
  assert.equal(image.statusCode, 200);
  assert.equal(image.isBase64Encoded, true);
  assert.equal(image.body, data);
  assert.equal(
    (await f.request(`/photos/${id}`, "DELETE", {}, display)).statusCode,
    403,
  );
  assert.equal(
    (await f.request(`/photos/${id}`, "DELETE", {}, admin)).statusCode,
    200,
  );
  assert.equal(
    (await f.request(`/photos/${id}`, "GET", undefined, display)).statusCode,
    404,
  );
  for (let i = 0; i < 100; i++)
    assert.equal(
      (await f.request("/photos", "POST", { data }, admin)).statusCode,
      201,
    );
  assert.equal(
    (await f.request("/photos", "POST", { data }, admin)).statusCode,
    409,
  );
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

test("Lambda faith tracker uses household auth, idempotent entries, validation and goal conflicts", async () => {
  const f = fixture();
  const display = await f.login("display"),
    admin = await f.login("admin");
  assert.equal((await f.request("/faith")).statusCode, 401);
  const input = {
    id: "d7bd7cb5-4db4-4da1-961a-83f506e5c700",
    person: "jun",
    kind: "reading",
    amount: 2,
    date: "2026-01-01",
    note: "John 1–2",
  };
  assert.equal(
    (await f.request("/faith/entries", "POST", input, display)).statusCode,
    201,
  );
  assert.equal(
    (
      await f.request(
        "/faith/entries",
        "POST",
        { ...input, date: "2999-01-01" },
        admin,
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (await f.request("/faith/entries", "POST", { ...input, amount: 0 }, admin))
      .statusCode,
    400,
  );
  assert.equal(
    (await f.request("/faith/entries", "POST", input, admin)).statusCode,
    201,
  );
  assert.equal(
    (await f.request("/faith/entries", "POST", input, admin)).statusCode,
    201,
  );
  assert.equal(
    (await f.request("/faith/entries", "POST", { ...input, amount: 3 }, admin))
      .statusCode,
    409,
  );
  const shared = JSON.parse(
    (await f.request("/faith", "GET", undefined, display)).body!,
  );
  assert.equal(shared.entries.length, 1);
  assert.equal(shared.entries[0].amount, 2);
  const goals = { reading: 2, prayer: 10, version: 0 };
  assert.equal(
    (await f.request("/faith/goals", "PUT", goals, display)).statusCode,
    200,
  );
  assert.equal(
    (await f.request("/faith/goals", "PUT", goals, admin)).statusCode,
    409,
  );
  assert.equal(
    (await f.request(`/faith/entries/${input.id}`, "DELETE", {}, display))
      .statusCode,
    200,
  );
  assert.equal(
    (await f.request(`/faith/entries/${input.id}`, "DELETE", {}, admin))
      .statusCode,
    200,
  );
  assert.equal((await f.repo.faithEntries()).length, 0);
});

test("Dynamo faith entries paginate and deduplicate retries; goal updates are conditional", async (t) => {
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: "us-east-1" }),
  );
  const repo = new DynamoRepository("test", client);
  const input = {
    id: "d7bd7cb5-4db4-4da1-961a-83f506e5c700",
    person: "jun" as const,
    kind: "reading" as const,
    amount: 2,
    date: "2026-01-01",
    note: "",
  };
  const entry = { ...input, createdAt: "2026-01-01T12:00:00Z" };
  const failure = Object.assign(new Error("conflict"), {
    name: "ConditionalCheckFailedException",
  });
  t.mock.method(
    client,
    "send",
    async (command: {
      input: Record<string, unknown>;
      constructor: { name: string };
    }) => {
      if (command.constructor.name === "GetCommand")
        return { Item: { data: entry } };
      assert.equal(
        command.input.ConditionExpression,
        "attribute_not_exists(pk)",
      );
      throw failure;
    },
  );
  assert.deepEqual(await repo.addFaith(input), entry);
  await assert.rejects(repo.addFaith({ ...input, amount: 3 }), Conflict);
  await assert.rejects(
    repo.saveFaithGoals({ reading: 1, prayer: 5, version: 0 }),
    Conflict,
  );
  t.mock.restoreAll();
  let pages = 0;
  t.mock.method(
    client,
    "send",
    async (command: { input: Record<string, unknown> }) => {
      assert.equal(command.input.ConsistentRead, true);
      assert.deepEqual(command.input.ExpressionAttributeValues, {
        ":pk": "home",
        ":prefix": "faith-entry:",
      });
      pages++;
      if (pages === 1)
        return {
          Items: [{ data: entry }],
          LastEvaluatedKey: { pk: "home", sk: "faith-entry:one" },
        };
      assert.deepEqual(command.input.ExclusiveStartKey, {
        pk: "home",
        sk: "faith-entry:one",
      });
      return { Items: [{ data: { ...entry, id: "two" } }] };
    },
  );
  assert.equal((await repo.faithEntries()).length, 2);
});
