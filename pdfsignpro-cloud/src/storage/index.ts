import type { StorageDriver } from "./types";
import { uploadToR2, getR2PresignedUrl, getR2Buffer, headR2Object } from "./r2";
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

  async exists(key: string): Promise<boolean> {
    return headR2Object(key);
  }
}

const ALLOWED_DRIVERS = ["r2", "s3", "local"] as const;

let _driver: StorageDriver | null = null;

export function getStorageDriver(): StorageDriver {
  if (!_driver) {
    const driver = (process.env.STORAGE_DRIVER ?? "r2").toLowerCase().trim();
    if (driver === "r2" || driver === "s3") {
      _driver = new R2StorageDriver();
    } else if (driver === "local") {
      _driver = createLocalStorageDriver();
    } else {
      throw new Error(
        `Unknown STORAGE_DRIVER: "${driver}". Allowed values: ${ALLOWED_DRIVERS.join(", ")}`
      );
    }
  }
  return _driver;
}

export type { StorageDriver } from "./types";
