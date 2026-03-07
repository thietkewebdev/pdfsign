export interface StorageDriver {
  /** Upload a buffer and return the storage key */
  upload(key: string, buffer: Buffer, contentType?: string): Promise<string>;

  /** Generate a presigned GET URL valid for the given expiry (seconds) */
  getPresignedUrl(key: string, expiresInSeconds?: number): Promise<string>;

  /** Fetch file content as Buffer (for server-side proxy, avoids CORS) */
  getBuffer?(key: string): Promise<Buffer>;

  /** Generate a presigned PUT URL for client uploads (optional) */
  getPresignedPutUrl?(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
}
