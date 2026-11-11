import {
  defaultFaithGoals,
  sameFaithEntry,
  type FaithEntry,
  type FaithInput,
  type FaithGoals,
} from "../shared/faith";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { defaultSettings, type Item, type Settings } from "../shared/model";
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY); CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,body TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1); CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,role TEXT NOT NULL,expires INTEGER NOT NULL); INSERT OR IGNORE INTO migrations VALUES(1);`,
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS faith_entries(id TEXT PRIMARY KEY, body TEXT NOT NULL)",
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY, image BLOB NOT NULL, created INTEGER NOT NULL)",
    );
    if (!this.get("settings")) this.set("settings", defaultSettings);
  }
  get<T>(key: string): T | null {
    const row = this.db.prepare("SELECT value FROM kv WHERE key=?").get(key) as
      { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : null;
  }
  set(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
  settings() {
    return this.get<Settings>("settings")!;
  }
  items(): Item[] {
    return (
      this.db.prepare("SELECT * FROM items ORDER BY rowid DESC").all() as {
        id: string;
        body: string;
        version: number;
      }[]
    ).map((r) => ({ ...JSON.parse(r.body), id: r.id, version: r.version }));
  }
  add(body: Omit<Item, "id" | "version">) {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO items VALUES(?,?,1)")
      .run(id, JSON.stringify(body));
    return { ...body, id, version: 1 };
  }
  update(id: string, version: number, body: Omit<Item, "id" | "version">) {
    return (
      this.db
        .prepare(
          "UPDATE items SET body=?,version=version+1 WHERE id=? AND version=?",
        )
        .run(JSON.stringify(body), id, version).changes > 0
    );
  }
  delete(id: string, version: number) {
    return (
      this.db
        .prepare("DELETE FROM items WHERE id=? AND version=?")
        .run(id, version).changes > 0
    );
  }
  faithEntries(): FaithEntry[] {
    return (
      this.db
        .prepare("SELECT body FROM faith_entries ORDER BY rowid DESC")
        .all() as { body: string }[]
    ).map((row) => JSON.parse(row.body) as FaithEntry);
  }
  faithGoals(): FaithGoals {
    return this.get<FaithGoals>("faith-goals") ?? { ...defaultFaithGoals };
  }
  addFaith(input: FaithInput): FaithEntry | null {
    const entry = { ...input, createdAt: new Date().toISOString() };
    this.db
      .prepare("INSERT OR IGNORE INTO faith_entries VALUES(?,?)")
      .run(entry.id, JSON.stringify(entry));
    const row = this.db
      .prepare("SELECT body FROM faith_entries WHERE id=?")
      .get(entry.id) as { body: string };
    const saved = JSON.parse(row.body) as FaithEntry;
    return sameFaithEntry(saved, input) ? saved : null;
  }
  removeFaith(id: string) {
    this.db.prepare("DELETE FROM faith_entries WHERE id=?").run(id);
  }
  photos() {
    return this.db
      .prepare("SELECT id FROM photos ORDER BY created, rowid")
      .all() as { id: string }[];
  }
  photo(id: string) {
    const row = this.db
      .prepare("SELECT image FROM photos WHERE id=?")
      .get(id) as { image: Uint8Array } | undefined;
    return row ? Buffer.from(row.image) : null;
  }
  addPhoto(id: string, image: Buffer) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const count = this.db
        .prepare("SELECT count(*) AS count FROM photos")
        .get() as { count: number };
      if (count.count >= 10) {
        this.db.exec("ROLLBACK");
        return false;
      }
      this.db
        .prepare("INSERT INTO photos VALUES(?,?,?)")
        .run(id, image, Date.now());
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  removePhoto(id: string) {
    return this.db.prepare("DELETE FROM photos WHERE id=?").run(id).changes > 0;
  }
  saveFaithGoals(goals: FaithGoals): FaithGoals | null {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (this.faithGoals().version !== goals.version) {
        this.db.exec("ROLLBACK");
        return null;
      }
      const next = { ...goals, version: goals.version + 1 };
      this.set("faith-goals", next);
      this.db.exec("COMMIT");
      return next;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
