import {
  defaultFaithGoals,
  sameFaithEntry,
  type FaithEntry,
  type FaithInput,
  type FaithGoals,
} from "../shared/faith";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import type { Item, Settings } from "../shared/model";
import { Conflict, NotReady, type Repository, type Session } from "./model";

export const documentClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({}),
  { marshallOptions: { removeUndefinedValues: true } },
);
export function conditional(error: unknown) {
  return (
    error instanceof Error && error.name === "ConditionalCheckFailedException"
  );
}
export class DynamoRepository implements Repository {
  constructor(
    public table: string,
    private client = documentClient,
  ) {}
  key(sk: string) {
    return { pk: "home", sk };
  }
  async get<T>(sk: string): Promise<T | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: this.key(sk),
        ConsistentRead: true,
      }),
    );
    return (result.Item?.data as T) ?? null;
  }
  async put(sk: string, data: unknown, expires?: number) {
    await this.client.send(
      new PutCommand({
        TableName: this.table,
        Item: { ...this.key(sk), data, expires },
      }),
    );
  }
  async settings() {
    const json = await this.get<string>("settings");
    if (!json)
      throw new NotReady("Import household data before opening the app");
    return JSON.parse(json) as Settings;
  }
  async saveSettings(settings: Settings, previous: string) {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: { ...this.key("settings"), data: JSON.stringify(settings) },
          ConditionExpression: "#data = :previous",
          ExpressionAttributeNames: { "#data": "data" },
          ExpressionAttributeValues: { ":previous": previous },
        }),
      );
    } catch (e) {
      if (conditional(e)) throw new Conflict();
      throw e;
    }
  }
  async items() {
    const items: Item[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
          ExpressionAttributeValues: { ":pk": "home", ":prefix": "item:" },
          ConsistentRead: true,
          ExclusiveStartKey: cursor,
        }),
      );
      items.push(...(page.Items ?? []).map((row) => row.data as Item));
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return items.sort((a, b) => b.id.localeCompare(a.id));
  }
  async add(body: Omit<Item, "id" | "version">) {
    const item = { ...body, id: randomUUID(), version: 1 };
    await this.put("item:" + item.id, item);
    return item;
  }
  async update(
    id: string,
    version: number,
    body: Omit<Item, "id" | "version">,
  ) {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: {
            ...this.key("item:" + id),
            data: { ...body, id, version: version + 1 },
          },
          ConditionExpression: "#data.#version = :version",
          ExpressionAttributeNames: { "#data": "data", "#version": "version" },
          ExpressionAttributeValues: { ":version": version },
        }),
      );
    } catch (e) {
      if (conditional(e)) throw new Conflict();
      throw e;
    }
  }
  async remove(id: string, version: number) {
    try {
      await this.client.send(
        new DeleteCommand({
          TableName: this.table,
          Key: this.key("item:" + id),
          ConditionExpression: "#data.#version = :version",
          ExpressionAttributeNames: { "#data": "data", "#version": "version" },
          ExpressionAttributeValues: { ":version": version },
        }),
      );
    } catch (e) {
      if (conditional(e)) throw new Conflict();
      throw e;
    }
  }
  async faithEntries() {
    const entries: FaithEntry[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
          ExpressionAttributeValues: {
            ":pk": "home",
            ":prefix": "faith-entry:",
          },
          ConsistentRead: true,
          ExclusiveStartKey: cursor,
        }),
      );
      entries.push(...(page.Items ?? []).map((row) => row.data as FaithEntry));
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return entries;
  }
  async faithGoals() {
    return (
      (await this.get<FaithGoals>("faith-goals")) ?? { ...defaultFaithGoals }
    );
  }
  async addFaith(input: FaithInput) {
    const entry = { ...input, createdAt: new Date().toISOString() };
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: { ...this.key("faith-entry:" + input.id), data: entry },
          ConditionExpression: "attribute_not_exists(pk)",
        }),
      );
      return entry;
    } catch (e) {
      if (!conditional(e)) throw e;
      const saved = await this.get<FaithEntry>("faith-entry:" + input.id);
      if (saved && sameFaithEntry(saved, input)) return saved;
      throw new Conflict();
    }
  }
  async removeFaith(id: string) {
    await this.client.send(
      new DeleteCommand({
        TableName: this.table,
        Key: this.key("faith-entry:" + id),
      }),
    );
  }
  async saveFaithGoals(goals: FaithGoals) {
    const next = { ...goals, version: goals.version + 1 };
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: { ...this.key("faith-goals"), data: next },
          ConditionExpression:
            goals.version === 0
              ? "attribute_not_exists(pk)"
              : "#data.#version = :version",
          ...(goals.version === 0
            ? {}
            : {
                ExpressionAttributeNames: {
                  "#data": "data",
                  "#version": "version",
                },
                ExpressionAttributeValues: { ":version": goals.version },
              }),
        }),
      );
      return next;
    } catch (e) {
      if (conditional(e)) throw new Conflict();
      throw e;
    }
  }
  session(tokenHash: string) {
    return this.get<Session>("session:" + tokenHash);
  }
  saveSession(tokenHash: string, session: Session) {
    return this.put("session:" + tokenHash, session, session.expires);
  }
  async removeSession(tokenHash: string) {
    await this.client.send(
      new DeleteCommand({
        TableName: this.table,
        Key: this.key("session:" + tokenHash),
      }),
    );
  }
  async allowLogin() {
    // A shared household limit survives cold starts and does not trust proxy IP headers.
    const window = Math.floor(Date.now() / 900000);
    const response = await this.client.send(
      new UpdateCommand({
        TableName: this.table,
        Key: this.key("login:" + window),
        UpdateExpression: "SET expires = :expires ADD attempts :one",
        ExpressionAttributeValues: {
          ":expires": (window + 2) * 900,
          ":one": 1,
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    return Number(response.Attributes?.attempts) <= 10;
  }
  async acquireLease(owner: string) {
    const now = Math.floor(Date.now() / 1000);
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: { ...this.key("sync-lease"), owner, expires: now + 180 },
          ConditionExpression: "attribute_not_exists(pk) OR expires < :now",
          ExpressionAttributeValues: { ":now": now },
        }),
      );
      return true;
    } catch (e) {
      if (conditional(e)) return false;
      throw e;
    }
  }
  async releaseLease(owner: string) {
    try {
      await this.client.send(
        new DeleteCommand({
          TableName: this.table,
          Key: this.key("sync-lease"),
          ConditionExpression: "#owner = :owner",
          ExpressionAttributeNames: { "#owner": "owner" },
          ExpressionAttributeValues: { ":owner": owner },
        }),
      );
    } catch (e) {
      if (!conditional(e)) throw e;
    }
  }
}
