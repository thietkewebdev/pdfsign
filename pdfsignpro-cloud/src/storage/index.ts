import type { StorageDriver } from "./types";
import {
  uploadToR2,
  getR2PresignedUrl,
  getR2Buffer,
  getR2BufferRange,
  headR2Object,
  deleteR2Object,
} from "./r2";
import { createLocalStorageDriver } from "./local";

class R2StorageDriver implements StorageDriver {
  async upload(
    key: string,
    buffer: Buffer,
    contentType = "application/pdf"
  ): Promise<string> {
    return uploadToR2(key, buffer, contentType);
  }

  async getPresignedUrl(
    key: string,
    expiresInSeconds = 3600
  ): Promise<string> {
    return getR2PresignedUrl(key, expiresInSeconds);
  }

  async getBuffer(key: string): Promise<Buffer> {
    return getR2Buffer(key);
  }

  async getBufferRange(
    key: string,
    start: number,
    endInclusive: number
  ): Promise<Buffer> {
    return getR2BufferRange(key, start, endInclusive);
  }

  async exists(key: string): Promise<boolean> {
    return headR2Object(key);
  }

  async delete(key: string): Promise<void> {
    await deleteR2Object(key);
  }
}

const ALLOWED_DRIVERS = ["r2", "s3", "local"] as const;

let _driver: StorageDriver | null = null;

function r2EnvConfigured(): boolean {
  return (
    Boolean(process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID) &&
    Boolean(process.env.R2_ACCESS_KEY_ID) &&
    Boolean(process.env.R2_SECRET_ACCESS_KEY)
  );
}

export function resolveStorageDriverName(): string {
  const raw = (process.env.STORAGE_DRIVER ?? "").toLowerCase().trim();
  if (raw === "local" || raw === "r2" || raw === "s3") {
    return raw;
  }
  if (raw !== "") {
    throw new Error(
      `Unknown STORAGE_DRIVER: "${raw}". Allowed values: ${ALLOWED_DRIVERS.join(", ")}`
    );
  }
  if (process.env.NODE_ENV !== "production" && !r2EnvConfigured()) {
    console.warn(
      "[pdfsignpro] STORAGE_DRIVER unset and R2 not configured — using local disk (.storage/uploads). For production set STORAGE_DRIVER=r2 and R2_* variables."
    );
    return "local";
  }
  return "r2";
}

/** Value stored on DocumentVersion.storageDriver (r2 covers S3-compatible). */
export function storageDriverDbLabel(): string {
  const d = resolveStorageDriverName();
  return d === "local" ? "local" : "r2";
}

export function getStorageDriver(): StorageDriver {
  if (!_driver) {
    const driver = resolveStorageDriverName();
    if (driver === "r2" || driver === "s3") {
      _driver = new R2StorageDriver();
    } else {
      _driver = createLocalStorageDriver();
    }
  }
  return _driver;
}

export type { StorageDriver } from "./types";
