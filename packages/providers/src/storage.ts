// StorageProvider seam (media: BOL/POD/inspection photos+video). Two impls:
//  - S3StorageProvider: real presigned PUT/GET against MinIO or any S3 API.
//  - StubStorageProvider: no network, for tests / zero-infra runs.
// Selected by STORAGE_PROVIDER env. Browsers upload bytes directly to the
// presigned URL, so large media never streams through the API.
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { loadEnv } from "@navastar/shared";

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  method: "PUT";
  headers?: Record<string, string>;
}

export interface StorageProvider {
  name: string;
  presignUpload(prefix: string, filename: string, mimeType: string): Promise<PresignedUpload>;
  getUrl(key: string): Promise<string>;
}

function safeKey(prefix: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Time-prefixed for natural ordering + collision avoidance.
  return `${prefix.replace(/\/$/, "")}/${Date.now()}-${safe}`;
}

/** Real MinIO/S3 presigned uploads + reads. */
export class S3StorageProvider implements StorageProvider {
  name = "s3";
  private client: S3Client;
  private bucket: string;
  private publicBase: string;

  constructor() {
    const env = loadEnv();
    this.bucket = env.S3_BUCKET;
    this.publicBase = (env.S3_PUBLIC_URL || env.S3_ENDPOINT).replace(/\/$/, "");
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE, // required for MinIO
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }

  async presignUpload(prefix: string, filename: string, mimeType: string): Promise<PresignedUpload> {
    const key = safeKey(prefix, filename);
    const cmd = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType });
    const uploadUrl = await getSignedUrl(this.client, cmd, { expiresIn: 900 });
    return { key, uploadUrl, method: "PUT", headers: { "Content-Type": mimeType } };
  }

  async getUrl(key: string): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn: 3600 });
  }
}

/** No-network stub for tests / zero-infra demos. Keys stable; URLs cosmetic. */
export class StubStorageProvider implements StorageProvider {
  name = "stub";
  private base: string;
  private bucket: string;
  constructor() {
    const env = loadEnv();
    this.base = (env.S3_PUBLIC_URL || env.S3_ENDPOINT).replace(/\/$/, "");
    this.bucket = env.S3_BUCKET;
  }
  async presignUpload(prefix: string, filename: string, mimeType: string): Promise<PresignedUpload> {
    const key = safeKey(prefix, filename);
    return {
      key,
      uploadUrl: `${this.base}/${this.bucket}/${key}?stub-presigned`,
      method: "PUT",
      headers: { "Content-Type": mimeType },
    };
  }
  async getUrl(key: string): Promise<string> {
    return `${this.base}/${this.bucket}/${key}`;
  }
}

let cached: StorageProvider | null = null;
export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  cached = loadEnv().STORAGE_PROVIDER === "stub" ? new StubStorageProvider() : new S3StorageProvider();
  return cached;
}

/** Test seam. */
export function setStorageProvider(p: StorageProvider | null): void {
  cached = p;
}
