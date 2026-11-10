import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { itemSchema, settingsSchema } from "../shared/model";
import { parseRule } from "../server/scheduling";
import { documentClient, DynamoRepository } from "../aws/repository";
import { required } from "../aws/storage";

let db: DatabaseSync | undefined;
try {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const path = process.env.DATABASE_PATH || "./data/home-hq.sqlite";
  if (!existsSync(path)) throw new Error("Local database does not exist");
  db = new DatabaseSync(path, { readOnly: true });
  // A consistent read transaction includes any committed WAL data, without changing the source.
  db.exec("BEGIN");
  const mode = db.prepare("SELECT value FROM kv WHERE key='demoMode'").get() as
    { value: string } | undefined;
  if (!mode || JSON.parse(mode.value) !== false)
    throw new Error("Only a live database can be imported");
  const row = db.prepare("SELECT value FROM kv WHERE key='settings'").get() as {
    value: string;
  };
  const settings = settingsSchema.parse(JSON.parse(row.value));
  for (const schedule of settings.schedules) parseRule(schedule);
  const items = (
    db.prepare("SELECT id,body,version FROM items").all() as {
      id: string;
      body: string;
      version: number;
    }[]
  ).map((row) => {
    if (
      !/^[a-zA-Z0-9_-]{1,80}$/.test(row.id) ||
      !Number.isSafeInteger(row.version) ||
      row.version < 1
    )
      throw new Error("Invalid item");
    return {
      ...itemSchema.parse(JSON.parse(row.body)),
      id: row.id,
      version: row.version,
    };
  });
  db.exec("COMMIT");
  db.close();
  db = undefined;
  if (process.argv.includes("--dry-run")) {
    const feeds = JSON.parse(process.env.CALENDAR_FEEDS || "{}");
    if (settings.calendars.some((c) => !feeds[c.id]))
      throw new Error("Missing feed configuration");
    console.log(
      `Validated ${settings.calendars.length} calendar definitions with matching feeds and ${items.length} list items. Nothing was uploaded.`,
    );
  } else {
    const table = required("TABLE_NAME");
    const repo = new DynamoRepository(table);
    if ((await repo.get("settings")) !== null)
      throw new Error(
        "Cloud household is already initialized; import never overwrites it",
      );
    // Settings is the ready marker, written LAST. Failed imports can resume using the
    // same source. Conditional puts refuse to overwrite any different cloud item.
    for (const item of items) {
      await documentClient.send(
        new PutCommand({
          TableName: table,
          Item: { ...repo.key("item:" + item.id), data: item },
          ConditionExpression: "attribute_not_exists(pk) OR #data = :data",
          ExpressionAttributeNames: { "#data": "data" },
          ExpressionAttributeValues: { ":data": item },
        }),
      );
    }
    await documentClient.send(
      new PutCommand({
        TableName: table,
        Item: { ...repo.key("settings"), data: JSON.stringify(settings) },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
    console.log(
      `Imported ${settings.calendars.length} calendar definitions and ${items.length} list items. Sessions and raw calendar caches were not copied.`,
    );
  }
} catch {
  console.error(
    "Import failed without overwriting existing cloud data. Check AWS credentials, TABLE_NAME, and a valid live source database. An initialized cloud household cannot be imported again. For a partial import, stop local edits and rerun with the same source.",
  );
  process.exitCode = 1;
} finally {
  db?.close();
}
