import type { StorageDriver } from "./types";
import { uploadToR2, getR2PresignedUrl } from "./r2";
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
}

let _driver: StorageDriver | null = null;

export function getStorageDriver(): StorageDriver {
  if (!_driver) {
    const driver = process.env.STORAGE_DRIVER ?? "r2";
    if (driver === "r2") {
      _driver = new R2StorageDriver();
    } else if (driver === "local") {
      _driver = createLocalStorageDriver();
    } else {
      throw new Error(`Unknown STORAGE_DRIVER: ${driver}`);
    }
  }
  return _driver;
}

export type { StorageDriver } from "./types";
