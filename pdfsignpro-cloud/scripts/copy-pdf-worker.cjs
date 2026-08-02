/**
 * Copy pdf.js main + worker from node_modules to public/pdfjs/
 * Runs on postinstall so deploys get self-hosted builds without CDN.
 * The app loads these at runtime to avoid webpack bundling pdfjs-dist.
 */
const fs = require("fs");
const path = require("path");

const legacyBuild = path.join(
  __dirname,
  "..",
  "node_modules",
  "pdfjs-dist",
  "legacy",
  "build"
);
const destDir = path.join(__dirname, "..", "public", "pdfjs");

const files = ["pdf.worker.min.mjs", "pdf.min.mjs"];

fs.mkdirSync(destDir, { recursive: true });

for (const name of files) {
  const src = path.join(legacyBuild, name);
  const dest = path.join(destDir, name);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${name} to public/pdfjs/`);
  } else {
    console.warn(`${name} not found at`, src);
  }
}
