import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { gzipSync, gunzipSync } from "node:zlib";
import { secretSchema, type Secrets, type Published } from "./model";
const s3 = new S3Client({});
const ssm = new SSMClient({});
export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error("Missing configuration: " + name);
  return value;
}
let cachedSecrets: { value: Secrets; until: number } | undefined;
export async function secrets(): Promise<Secrets> {
  if (cachedSecrets && cachedSecrets.until > Date.now())
    return cachedSecrets.value;
  const result = await ssm.send(
    new GetParameterCommand({
      Name: required("CONFIG_PARAMETER"),
      WithDecryption: true,
    }),
  );
  // Do not attach Zod issues here: they can contain secret input values.
  const parsed = secretSchema.safeParse(
    JSON.parse(result.Parameter?.Value ?? "{}"),
  );
  if (!parsed.success) throw new Error("Invalid private configuration");
  cachedSecrets = { value: parsed.data, until: Date.now() + 60000 };
  return parsed.data;
}
export async function readObject<T>(key: string): Promise<T | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: required("CACHE_BUCKET"), Key: key }),
    );
    const bytes = await result.Body!.transformToByteArray();
    return JSON.parse(gunzipSync(bytes).toString("utf8")) as T;
  } catch (e) {
    if (e instanceof Error && e.name === "NoSuchKey") return null;
    throw e;
  }
}
export async function writeObject(key: string, value: unknown) {
  await s3.send(
    new PutObjectCommand({
      Bucket: required("CACHE_BUCKET"),
      Key: key,
      Body: gzipSync(JSON.stringify(value)),
      ContentType: "application/json",
      ContentEncoding: "gzip",
      ServerSideEncryption: "AES256",
      CacheControl: "no-store",
    }),
  );
}
let published: { value: Published | null; until: number } | undefined;
export async function readPublished() {
  if (published && published.until > Date.now()) return published.value;
  const value = await readObject<Published>("snapshot.json.gz");
  published = { value, until: Date.now() + 30000 };
  return value;
}
