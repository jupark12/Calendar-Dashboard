import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { gzipSync, gunzipSync } from "node:zlib";
import { secretSchema, type Secrets, type Published } from "./model";
import { maxPhotos } from "../shared/photos";
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
const photoKey = (id: string) => `photos/${id}.jpg`;
export const s3Photos = {
  async list() {
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: required("CACHE_BUCKET"),
        Prefix: "photos/",
        MaxKeys: maxPhotos + 1,
      }),
    );
    return (result.Contents ?? [])
      .filter((object) => /^photos\/[\da-f-]{36}\.jpg$/.test(object.Key ?? ""))
      .sort(
        (a, b) =>
          (a.LastModified?.getTime() ?? 0) - (b.LastModified?.getTime() ?? 0),
      )
      .map((object) => object.Key!.slice(7, -4));
  },
  async get(id: string) {
    try {
      const result = await s3.send(
        new GetObjectCommand({
          Bucket: required("CACHE_BUCKET"),
          Key: photoKey(id),
        }),
      );
      return Buffer.from(await result.Body!.transformToByteArray());
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "NoSuchKey" || error.name === "NotFound")
      )
        return null;
      throw error;
    }
  },
  async add(id: string, image: Buffer) {
    if ((await this.list()).length >= maxPhotos) return false;
    await s3.send(
      new PutObjectCommand({
        Bucket: required("CACHE_BUCKET"),
        Key: photoKey(id),
        Body: image,
        ContentType: "image/jpeg",
        ServerSideEncryption: "AES256",
        CacheControl: "private, no-store",
      }),
    );
    return true;
  },
  async remove(id: string) {
    if (!(await this.get(id))) return false;
    await s3.send(
      new DeleteObjectCommand({
        Bucket: required("CACHE_BUCKET"),
        Key: photoKey(id),
      }),
    );
    return true;
  },
};
export type PhotoStorage = {
  list(): Promise<string[]>;
  get(id: string): Promise<Buffer | null>;
  add(id: string, image: Buffer): Promise<boolean>;
  remove(id: string): Promise<boolean>;
};
