#!/usr/bin/env node
/**
 * Fail if UI modules use Tauri helpers without importing them from api.js.
 * Catches the class of bug that showed "listen is not defined" at boot.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "js");
const NAMES = ["listen", "invoke", "dialog", "opener"];
const files = fs.readdirSync(root).filter((f) => f.endsWith(".js") && f !== "demo-mock.js" && f !== "api.js");

let failed = false;
for (const file of files) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  const importMatch = src.match(/import\s*\{([^}]+)\}\s*from\s*["']\.\/api\.js["']/);
  const imported = new Set(
    (importMatch?.[1] || "")
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/).pop()?.trim())
      .filter(Boolean),
  );
  for (const name of NAMES) {
    // Word-boundary use that is not a property access like foo.listen
    const re = new RegExp(`(?<![.\\w])${name}\\s*\\(`);
    if (re.test(src) && !imported.has(name)) {
      console.error(`${file}: uses ${name}() but does not import it from ./api.js`);
      failed = true;
    }
  }
  // Bare window.__TAURI__.* outside optional chaining for critical paths is OK;
  // prefer api.js wrappers. Flag direct .event.listen / .core.invoke as smell.
  if (/\.__TAURI__\.event\.listen\b/.test(src) || /\.__TAURI__\.core\.invoke\b/.test(src)) {
    console.error(`${file}: prefer listen/invoke from ./api.js over raw window.__TAURI__`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("check-globals: ok");
