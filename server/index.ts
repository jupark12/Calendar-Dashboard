import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Store } from "./database";
import { Integrations } from "./integrations";
import { createApp } from "./app";
import { seedDemo } from "./demo";
if (existsSync(".env")) process.loadEnvFile(".env");
const demo = process.env.DEMO_MODE !== "false";
const production = process.env.NODE_ENV === "production";
const origin = process.env.APP_ORIGIN || "http://localhost:3000";
const secure = process.env.COOKIE_SECURE === "true";
const adminPassword = process.env.ADMIN_PASSWORD || "";
const displayPassword = process.env.DISPLAY_PASSWORD || "";
if (
  !demo &&
  (adminPassword.length < 20 ||
    displayPassword.length < 12 ||
    adminPassword === displayPassword)
)
  throw new Error(
    "Configure distinct passwords: ADMIN_PASSWORD at least 20 characters and DISPLAY_PASSWORD at least 12 characters",
  );
if (!demo && !process.env.APP_ORIGIN) throw new Error("APP_ORIGIN is required");
if (production && !demo && (!secure || !origin.startsWith("https://")))
  throw new Error(
    "Production requires HTTPS APP_ORIGIN and COOKIE_SECURE=true",
  );
const port = Number(process.env.PORT || 3000);
const store = new Store(
  process.env.DATABASE_PATH ||
    (demo ? "./data/demo.sqlite" : "./data/home-hq.sqlite"),
);
const storedMode = store.get<boolean>("demoMode");
if (storedMode !== null && storedMode !== demo)
  throw new Error(
    "Use a separate database when switching between demo and live mode",
  );
store.set("demoMode", demo);
if (demo) seedDemo(store);
const feeds = JSON.parse(process.env.CALENDAR_FEEDS || "{}") as Record<
  string,
  string
>;
if (
  !feeds ||
  typeof feeds !== "object" ||
  Array.isArray(feeds) ||
  Object.values(feeds).some((v) => typeof v !== "string")
)
  throw new Error(
    "CALENDAR_FEEDS must be a JSON object of calendar IDs and URLs",
  );
const integrations = new Integrations(
  store,
  demo,
  feeds,
  process.env.WEATHER_USER_AGENT || "HomeHQ/1.0",
);
const app = createApp(store, integrations, {
  demo,
  origin,
  secure,
  adminPassword,
  displayPassword,
});
let closeVite: (() => Promise<void>) | undefined;
if (production) {
  const express = (await import("express")).default;
  app.use(
    express.static(resolve("dist"), {
      maxAge: "1h",
      index: false,
      setHeaders(res, path) {
        if (path.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );
  app.get("/{*path}", (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(resolve("dist/index.html"));
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
  closeVite = () => vite.close();
}
const server = app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Home HQ ${demo ? "DEMO" : "LIVE"} → http://localhost:${port}`),
);
void integrations.sync();
const timer = setInterval(() => void integrations.sync(), 60000);
timer.unref();
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  await closeVite?.();
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
