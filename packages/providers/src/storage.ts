// StorageProvider seam (media: BOL/POD/inspection photos+video). MVP ships a
// stub that mints deterministic keys and pseudo-URLs so upstream code (driver
// POD, inspections) can be built against the interface. The real MinIO/S3 client
// (aws-sdk presigned PUT/GET) is wired in Module 3 when media capture lands.
import { loadEnv } from "@navastar/shared";

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  method: "PUT";
  headers?: Record<string, string>;
}

export interface StorageProvider {
  name: string;
  /** Get a presigned URL the client can PUT bytes to. */
  presignUpload(prefix: string, filename: string, mimeType: string): Promise<PresignedUpload>;
  /** Get a (possibly presigned) URL to read an object. */
  getUrl(key: string): Promise<string>;
}

/** MVP stub — no network. Keys are stable; URLs point at the configured endpoint. */
export class StubStorageProvider implements StorageProvider {
  name = "stub";
  private endpoint: string;
  private bucket: string;
  constructor() {
    const env = loadEnv();
    this.endpoint = env.S3_ENDPOINT.replace(/\/$/, "");
    this.bucket = env.S3_BUCKET;
  }
  async presignUpload(prefix: string, filename: string, mimeType: string): Promise<PresignedUpload> {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${prefix.replace(/\/$/, "")}/${Date.now()}-${safe}`;
    return {
      key,
      uploadUrl: `${this.endpoint}/${this.bucket}/${key}?stub-presigned`,
      method: "PUT",
      headers: { "Content-Type": mimeType },
    };
  }
  async getUrl(key: string): Promise<string> {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }
}

let cached: StorageProvider | null = null;
export function getStorageProvider(): StorageProvider {
  // Module 3 swaps this for an S3/MinIO-backed implementation selected by env.
  if (!cached) cached = new StubStorageProvider();
  return cached;
}
