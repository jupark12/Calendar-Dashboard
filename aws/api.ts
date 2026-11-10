import { faithEntrySchema, faithGoalsSchema } from "../shared/faith";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { z } from "zod";
import { itemSchema, settingsSchema } from "../shared/model";
import { dateKey } from "../shared/time";
import { nextPickup, parseRule } from "../server/scheduling";
import { Integrations } from "../server/integrations";
import {
  Conflict,
  NotReady,
  IntegrationMemory,
  fingerprint,
  hash,
  type Repository,
  type Secrets,
  type Published,
} from "./model";
import { DynamoRepository } from "./repository";
import { required, secrets, readPublished } from "./storage";

type Dependencies = {
  repo: Repository;
  secrets: () => Promise<Secrets>;
  published: () => Promise<Published | null>;
  origin: string;
};
const cookie = (token: string, seconds: number) =>
  `hq_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
const respond = (
  statusCode: number,
  value: unknown,
  headers = {},
  cookies?: string[],
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  },
  body: statusCode === 304 ? "" : JSON.stringify(value),
  ...(cookies ? { cookies } : {}),
});
const failure = (code: number, error: string) => respond(code, { error });
class InvalidInput extends Error {}

export function createHandler(deps: Dependencies) {
  return async (
    event: APIGatewayProxyEventV2,
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
      const method = event.requestContext.http.method;
      const path = event.rawPath;
      const headers = Object.fromEntries(
        Object.entries(event.headers).map(([k, v]) => [k.toLowerCase(), v]),
      );
      if (method === "GET" && path === "/api/health")
        return respond(200, { ok: true });
      let body: unknown;
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        if (headers.origin !== deps.origin)
          return failure(403, "Request origin rejected");
        if (
          headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
          "application/json"
        )
          return failure(415, "JSON required");
        const raw = event.isBase64Encoded
          ? Buffer.from(event.body ?? "", "base64").toString("utf8")
          : (event.body ?? "");
        if (Buffer.byteLength(raw) > 32768)
          return failure(413, "Request too large");
        body = JSON.parse(raw);
      }
      const config = await deps.secrets();
      const token = (event.cookies?.join("; ") ?? headers.cookie ?? "")
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("hq_session="))
        ?.slice(11);
      const session =
        token && token.length < 200
          ? await deps.repo.session(hash(token))
          : null;
      const expectedCredential = session
        ? hash(
            session.role === "admin"
              ? config.adminPassword
              : config.displayPassword,
          )
        : "";
      const role =
        session &&
        session.expires > Date.now() / 1000 &&
        session.credential === expectedCredential
          ? session.role
          : null;
      if (method === "GET" && path === "/api/session")
        return respond(200, { role, demo: false });
      if (method === "POST" && path === "/api/login") {
        const input = z
          .object({
            role: z.enum(["admin", "display"]),
            password: z.string().max(256),
          })
          .parse(body);
        if (!(await deps.repo.allowLogin()))
          return failure(429, "Too many attempts. Try again in 15 minutes.");
        const expected =
          input.role === "admin"
            ? config.adminPassword
            : config.displayPassword;
        if (
          !timingSafeEqual(
            Buffer.from(hash(input.password)),
            Buffer.from(hash(expected)),
          )
        )
          return failure(401, "Incorrect access password");
        const token = randomBytes(32).toString("hex");
        const seconds = input.role === "admin" ? 43200 : 365 * 86400;
        await deps.repo.saveSession(hash(token), {
          role: input.role,
          credential: hash(expected),
          expires: Math.floor(Date.now() / 1000) + seconds,
        });
        return respond(200, { role: input.role }, {}, [cookie(token, seconds)]);
      }
      if (method === "POST" && path === "/api/logout") {
        if (token && token.length < 200)
          await deps.repo.removeSession(hash(token));
        return respond(200, { ok: true }, {}, [cookie("", 0)]);
      }
      if (!role) return failure(401, "Please connect this device");
      // API writes remain unavailable until the explicit, resumable migration finishes.
      const settings = await deps.repo.settings();
      if (method === "GET" && path === "/api/dashboard") {
        const [items, published] = await Promise.all([
          deps.repo.items(),
          deps.published(),
        ]);
        const snapshot =
          published?.fingerprint === fingerprint(settings, config)
            ? published.snapshot
            : new Integrations(
                new IntegrationMemory(settings),
                false,
                {},
                config.userAgent,
              ).snapshot();
        const today = dateKey(new Date(), settings.timezone);
        const payload = {
          ...snapshot,
          settings,
          items,
          alerts: snapshot.alerts.filter(
            (a) => Date.parse(a.expires) > Date.now(),
          ),
          pickups: settings.schedules.map((s) => ({
            id: s.id,
            date: nextPickup(s, today),
          })),
        };
        const etag = `"${hash(JSON.stringify(payload))}"`;
        if (headers["if-none-match"] === etag)
          return respond(304, null, { ETag: etag });
        return respond(200, payload, { ETag: etag });
      }
      if (method === "GET" && path === "/api/faith") {
        const [entries, goals] = await Promise.all([
          deps.repo.faithEntries(),
          deps.repo.faithGoals(),
        ]);
        return respond(200, { entries, goals });
      }
      if (method === "POST" && path === "/api/faith/entries") {
        const input = faithEntrySchema.parse(body);
        if (input.date > dateKey(new Date(), settings.timezone))
          return failure(400, "Choose today or an earlier date.");
        return respond(201, await deps.repo.addFaith(input));
      }
      const faithMatch = /^\/api\/faith\/entries\/([^/]+)$/.exec(path);
      if (method === "DELETE" && faithMatch) {
        await deps.repo.removeFaith(z.string().uuid().parse(faithMatch[1]));
        return respond(200, { ok: true });
      }
      if (method === "PUT" && path === "/api/faith/goals")
        return respond(
          200,
          await deps.repo.saveFaithGoals(faithGoalsSchema.parse(body)),
        );
      if (role !== "admin") return failure(403, "Management access required");
      if (method === "POST" && path === "/api/items")
        return respond(201, await deps.repo.add(itemSchema.parse(body)));
      const match = /^\/api\/items\/([a-zA-Z0-9_-]{1,80})$/.exec(path);
      if (match && ["PUT", "DELETE"].includes(method)) {
        const { version } = z
          .object({ version: z.number().int().positive() })
          .parse(body);
        if (method === "PUT")
          await deps.repo.update(match[1], version, itemSchema.parse(body));
        else await deps.repo.remove(match[1], version);
        return respond(200, { ok: true });
      }
      if (method === "PUT" && path === "/api/settings") {
        const input = z
          .object({ settings: settingsSchema, previous: z.string().max(32768) })
          .parse(body);
        try {
          for (const schedule of input.settings.schedules) parseRule(schedule);
        } catch {
          throw new InvalidInput();
        }
        const night = input.settings.night;
        if (
          night.override !== "auto" &&
          (!night.overrideUntil ||
            Date.parse(night.overrideUntil) <= Date.now() ||
            Date.parse(night.overrideUntil) > Date.now() + 86400000)
        )
          return failure(400, "Night override must expire within 24 hours");
        await deps.repo.saveSettings(input.settings, input.previous);
        return respond(200, { ok: true });
      }
      return failure(404, "API route not found");
    } catch (e) {
      if (
        e instanceof z.ZodError ||
        e instanceof SyntaxError ||
        e instanceof InvalidInput
      )
        return failure(
          400,
          "Invalid request. Check your input and recurrence rule.",
        );
      if (e instanceof Conflict)
        return failure(
          409,
          "Data changed on another device. Reload before saving.",
        );
      if (e instanceof NotReady)
        return failure(
          503,
          "Household setup is incomplete. Run the AWS data import.",
        );
      console.error("Home HQ API request failed");
      return failure(503, "Service temporarily unavailable. Please retry.");
    }
  };
}
export const handler = (event: APIGatewayProxyEventV2) =>
  createHandler({
    repo: new DynamoRepository(required("TABLE_NAME")),
    secrets,
    published: readPublished,
    origin: required("APP_ORIGIN"),
  })(event);
