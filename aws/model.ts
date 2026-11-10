import type { FaithEntry, FaithInput, FaithGoals } from "../shared/faith";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Item, Settings, Snapshot } from "../shared/model";

export const secretSchema = z
  .object({
    adminPassword: z.string().min(20).max(256),
    displayPassword: z.string().min(12).max(256),
    feeds: z.record(
      z.string().regex(/^[a-z0-9_-]{1,32}$/),
      z
        .string()
        .url()
        .refine((value) => {
          const u = new URL(value);
          return (
            u.protocol === "https:" &&
            u.hostname === "calendar.google.com" &&
            !u.username &&
            !u.password &&
            !u.port
          );
        }, "Only Google HTTPS feeds are supported"),
    ),
    userAgent: z.string().min(1).max(200),
  })
  .refine(
    (value) => value.adminPassword !== value.displayPassword,
    "Use distinct passwords",
  );
export type Secrets = z.infer<typeof secretSchema>;
export type Role = "admin" | "display";
export type Session = { role: Role; expires: number; credential: string };
export type Published = { fingerprint: string; snapshot: Snapshot };
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const fingerprint = (settings: Settings, secrets: Secrets) =>
  hash(
    JSON.stringify([
      settings.timezone,
      settings.location.latitude,
      settings.location.longitude,
      settings.calendars.map((c) => c.id),
      secrets.feeds,
    ]),
  );
export class Conflict extends Error {}
export class NotReady extends Error {}
export interface Repository {
  faithEntries(): Promise<FaithEntry[]>;
  faithGoals(): Promise<FaithGoals>;
  addFaith(input: FaithInput): Promise<FaithEntry>;
  removeFaith(id: string): Promise<void>;
  saveFaithGoals(goals: FaithGoals): Promise<FaithGoals>;
  settings(): Promise<Settings>;
  saveSettings(settings: Settings, previous: string): Promise<void>;
  items(): Promise<Item[]>;
  add(body: Omit<Item, "id" | "version">): Promise<Item>;
  update(
    id: string,
    version: number,
    body: Omit<Item, "id" | "version">,
  ): Promise<void>;
  remove(id: string, version: number): Promise<void>;
  session(tokenHash: string): Promise<Session | null>;
  saveSession(tokenHash: string, session: Session): Promise<void>;
  removeSession(tokenHash: string): Promise<void>;
  allowLogin(): Promise<boolean>;
}
// An invocation-local integration workspace. Durable data lives in DynamoDB/S3.
export class IntegrationMemory {
  constructor(
    private config: Settings,
    public cache: Record<string, unknown> = {},
  ) {}
  get<T>(key: string): T | null {
    return (this.cache[key] as T) ?? null;
  }
  set(key: string, value: unknown) {
    this.cache[key] = value;
  }
  settings() {
    return this.config;
  }
  items(): Item[] {
    return [];
  }
}
