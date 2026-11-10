import { randomUUID } from "node:crypto";
import type { Settings } from "../shared/model";
import { Integrations } from "../server/integrations";
import {
  IntegrationMemory,
  NotReady,
  fingerprint,
  type Secrets,
  type Published,
} from "./model";
import { DynamoRepository } from "./repository";
import { readObject, writeObject, required, secrets } from "./storage";
export type SavedCache = {
  fingerprint: string;
  values: Record<string, unknown>;
};
type SyncDependencies = {
  settings(): Promise<Settings>;
  secrets(): Promise<Secrets>;
  acquireLease(owner: string): Promise<boolean>;
  releaseLease(owner: string): Promise<void>;
  read(): Promise<SavedCache | null>;
  publish(cache: SavedCache, snapshot: Published): Promise<void>;
  refresh?: (integration: Integrations) => Promise<void>;
};
export async function runSync(deps: SyncDependencies) {
  const owner = randomUUID();
  if (!(await deps.acquireLease(owner))) return { skipped: true };
  try {
    const settings = await deps.settings();
    const config = await deps.secrets();
    const identity = fingerprint(settings, config);
    const saved = await deps.read();
    const memory = new IntegrationMemory(
      settings,
      saved?.fingerprint === identity ? saved.values : {},
    );
    const integrations = new Integrations(
      memory,
      false,
      config.feeds,
      config.userAgent,
    );
    await (deps.refresh ? deps.refresh(integrations) : integrations.sync());
    // A settings edit during network requests must not publish mislabeled data.
    if (JSON.stringify(await deps.settings()) !== JSON.stringify(settings))
      return { superseded: true };
    await deps.publish(
      { fingerprint: identity, values: memory.cache },
      { fingerprint: identity, snapshot: integrations.snapshot() },
    );
    return { ok: true };
  } catch (e) {
    if (e instanceof NotReady) return { waitingForImport: true };
    // Provider failures are already represented in per-provider status. Infrastructure
    // failures must fail the invocation so EventBridge/Lambda can retry and alarm.
    console.error("Home HQ sync failed");
    throw new Error("Home HQ sync failed");
  } finally {
    await deps.releaseLease(owner);
  }
}
export async function handler() {
  const repo = new DynamoRepository(required("TABLE_NAME"));
  return runSync({
    settings: () => repo.settings(),
    secrets,
    acquireLease: (owner) => repo.acquireLease(owner),
    releaseLease: (owner) => repo.releaseLease(owner),
    read: () => readObject<SavedCache>("cache.json.gz"),
    publish: async (cache, snapshot) => {
      await writeObject("cache.json.gz", cache);
      await writeObject("snapshot.json.gz", snapshot);
    },
  });
}
