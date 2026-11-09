import express, { type ErrorRequestHandler } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { itemSchema, settingsSchema } from "../shared/model";
import { nextPickup, parseRule } from "./scheduling";
import { dateKey } from "../shared/time";
import type { Store } from "./database";
import type { Integrations } from "./integrations";
export type AppConfig = {
  demo: boolean;
  origin: string;
  secure: boolean;
  adminPassword: string;
  displayPassword: string;
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function createApp(
  store: Store,
  integrations: Integrations,
  config: AppConfig,
) {
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", "strong");
  app.use((_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
    if (process.env.NODE_ENV === "production")
      res.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
    next();
  });
  app.use("/api", express.json({ limit: "32kb" }));
  app.get("/healthz", (_req, res) => {
    store.db.prepare("SELECT 1").get();
    res.json({ ok: true });
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "private, no-cache");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      if (
        !origin ||
        (!config.demo && origin !== config.origin) ||
        (config.demo &&
          origin !== `http://${req.headers.host}` &&
          origin !== config.origin)
      ) {
        res.status(403).json({ error: "Request origin rejected" });
        return;
      }
      if (!req.is("application/json")) {
        res.status(415).json({ error: "JSON required" });
        return;
      }
    }
    next();
  });
  app.use("/api", (req, res, next) => {
    if (config.demo) {
      res.locals.role = "admin";
      next();
      return;
    }
    const token = (req.headers.cookie ?? "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("hq_session="))
      ?.slice(11);
    if (token && token.length < 200) {
      const row = store.db
        .prepare("SELECT role FROM sessions WHERE hash=? AND expires>?")
        .get(hash(token), Date.now()) as { role: string } | undefined;
      res.locals.role = row?.role ?? null;
    }
    next();
  });
  app.get("/api/session", (_req, res) =>
    res.json({ role: res.locals.role ?? null, demo: config.demo }),
  );
  const attempts = new Map<string, { count: number; until: number }>();
  app.post("/api/login", (req, res) => {
    res.set("Cache-Control", "no-store");
    const now = Date.now();
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
    const ip = req.ip ?? "unknown";
    const a = attempts.get(ip) ?? { count: 0, until: now + 900000 };
    if (a.count >= 10) {
      res
        .status(429)
        .json({ error: "Too many attempts. Try again in 15 minutes." });
      return;
    }
    if (attempts.size > 10000) {
      res.status(503).json({ error: "Please try later" });
      return;
    }
    a.count++;
    attempts.set(ip, a);
    const input = z
      .object({
        role: z.enum(["admin", "display"]),
        password: z.string().max(256),
      })
      .parse(req.body);
    const expected =
      input.role === "admin" ? config.adminPassword : config.displayPassword;
    if (
      !expected ||
      !timingSafeEqual(
        Buffer.from(hash(input.password)),
        Buffer.from(hash(expected)),
      )
    ) {
      res.status(401).json({ error: "Incorrect access password" });
      return;
    }
    attempts.delete(ip);
    store.db.prepare("DELETE FROM sessions WHERE expires<?").run(now);
    const token = randomBytes(32).toString("hex");
    const seconds = input.role === "admin" ? 43200 : 90 * 86400;
    store.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(hash(token), input.role, now + seconds * 1000);
    res.cookie("hq_session", token, {
      httpOnly: true,
      secure: config.secure,
      sameSite: "strict",
      maxAge: seconds * 1000,
      path: "/",
    });
    res.json({ role: input.role });
  });
  app.post("/api/logout", (req, res) => {
    const token = (req.headers.cookie ?? "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("hq_session="))
      ?.slice(11);
    if (token)
      store.db.prepare("DELETE FROM sessions WHERE hash=?").run(hash(token));
    res.clearCookie("hq_session", {
      path: "/",
      secure: config.secure,
      sameSite: "strict",
    });
    res.json({ ok: true });
  });
  app.use("/api", (_req, res, next) => {
    if (!res.locals.role) {
      res.status(401).json({ error: "Please connect this device" });
      return;
    }
    next();
  });
  app.get("/api/dashboard", (req, res) => {
    const data = integrations.snapshot();
    const today = dateKey(new Date(), data.settings.timezone);
    const payload = {
      ...data,
      pickups: data.settings.schedules.map((s) => ({
        id: s.id,
        date: nextPickup(s, today),
      })),
    };
    // Explicit validators also work with fetch clients that send Cache-Control: no-cache.
    const etag = `"${hash(JSON.stringify(payload))}"`;
    res.set("ETag", etag);
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    res.json(payload);
  });
  app.use("/api", (_req, res, next) => {
    if (res.locals.role !== "admin") {
      res.status(403).json({ error: "Management access required" });
      return;
    }
    next();
  });
  app.post("/api/items", (req, res) => {
    const item = store.add(itemSchema.parse(req.body));
    res.status(201).json(item);
  });
  app.put("/api/items/:id", (req, res) => {
    const version = z.number().int().positive().parse(req.body.version);
    const body = itemSchema.parse(req.body);
    if (!store.update(String(req.params.id), version, body)) {
      res.status(409).json({
        error: "This item changed on another device. Refresh and try again.",
      });
      return;
    }
    res.json({ ok: true });
  });
  app.delete("/api/items/:id", (req, res) => {
    const version = z.number().int().positive().parse(req.body.version);
    if (!store.delete(String(req.params.id), version)) {
      res.status(409).json({
        error: "This item changed on another device. Refresh and try again.",
      });
      return;
    }
    res.json({ ok: true });
  });
  app.put("/api/settings", (req, res) => {
    const input = z
      .object({ settings: settingsSchema, previous: z.string() })
      .parse(req.body);
    const settings = input.settings;
    for (const s of settings.schedules) parseRule(s);
    if (JSON.stringify(store.settings()) !== input.previous) {
      res.status(409).json({
        error: "Settings changed on another device. Reload before saving.",
      });
      return;
    }
    if (
      settings.night.override !== "auto" &&
      (!settings.night.overrideUntil ||
        Date.parse(settings.night.overrideUntil) <= Date.now() ||
        Date.parse(settings.night.overrideUntil) > Date.now() + 86400000)
    ) {
      res
        .status(400)
        .json({ error: "Night override must expire within 24 hours" });
      return;
    }
    const oldSettings = store.settings();
    if (
      oldSettings.timezone !== settings.timezone ||
      oldSettings.location.latitude !== settings.location.latitude ||
      oldSettings.location.longitude !== settings.location.longitude
    ) {
      // Weather from another place must not be labeled as the new location.
      store.db
        .prepare("DELETE FROM kv WHERE key IN ('weather', 'alerts')")
        .run();
    }
    store.set("settings", settings);
    integrations.invalidate();
    void integrations.sync();
    res.json({ ok: true });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API route not found" }),
  );
  const errors: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: err.issues
          .map((i) => i.path.join(".") + ": " + i.message)
          .join("; "),
      });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    res.status(400).json({
      error: "Unable to process request. Check your input and recurrence rule.",
    });
  };
  app.use(errors);
  return app;
}
