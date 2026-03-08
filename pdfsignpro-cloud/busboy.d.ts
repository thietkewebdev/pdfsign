declare module "busboy" {
  import { Readable, Writable } from "node:stream";

  interface BusboyConfig {
    headers?: Record<string, string>;
  }

  interface FileInfo {
    filename: string;
    encoding: string;
    mimeType: string;
  }

  interface Busboy extends Writable {
    on(event: "file", callback: (name: string, stream: Readable, info: FileInfo) => void): this;
    on(event: "field", callback: (name: string, value: string) => void): this;
    on(event: "finish", callback: () => void): this;
    on(event: "error", callback: (err: Error) => void): this;
  }

  function busboy(options: BusboyConfig): Busboy;
  export default busboy;
}
