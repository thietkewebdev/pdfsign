export interface StorageDriver {
  /** Upload a buffer and return the storage key */
  upload(key: string, buffer: Buffer, contentType?: string): Promise<string>;

  /** Delete object by key (idempotent when missing) */
  delete?(key: string): Promise<void>;

  /** Generate a presigned GET URL valid for the given expiry (seconds) */
  getPresignedUrl(key: string, expiresInSeconds?: number): Promise<string>;

  /** Fetch file content as Buffer (for server-side proxy, avoids CORS) */
  getBuffer?(key: string): Promise<Buffer>;

  /** Inclusive end index; used for HTTP Range / pdf.js chunked loading */
  getBufferRange?(
    key: string,
    start: number,
    endInclusive: number
  ): Promise<Buffer>;

  /** Check if object exists (for download validation) */
  exists?(key: string): Promise<boolean>;

  /** Generate a presigned PUT URL for client uploads (optional) */
  getPresignedPutUrl?(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
}
