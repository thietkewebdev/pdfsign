import { promises as fs } from "fs";
import path from "path";
import type { StorageDriver } from "./types";

const UPLOAD_DIR = path.join(process.cwd(), ".storage", "uploads");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

class LocalStorageDriver implements StorageDriver {
  async upload(
    key: string,
    buffer: Buffer,
    _contentType = "application/pdf"
  ): Promise<string> {
    const fullPath = path.join(UPLOAD_DIR, key);
    await ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, buffer);
    return key;
  }

  async getPresignedUrl(
    key: string,
    _expiresInSeconds = 3600
  ): Promise<string> {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return `${baseUrl}/api/storage/${encodeURIComponent(key)}`;
  }

  async getBuffer(key: string): Promise<Buffer> {
    const fullPath = path.join(UPLOAD_DIR, key);
    return fs.readFile(fullPath);
  }

  async exists(key: string): Promise<boolean> {
    try {
      const fullPath = path.join(UPLOAD_DIR, key);
      const stat = await fs.stat(fullPath);
      return stat.isFile();
    } catch {
      return false;
    }
  }
}

export function createLocalStorageDriver(): StorageDriver {
  return new LocalStorageDriver();
}
