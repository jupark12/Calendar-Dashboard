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
  close() {
    this.db.close();
  }
}
