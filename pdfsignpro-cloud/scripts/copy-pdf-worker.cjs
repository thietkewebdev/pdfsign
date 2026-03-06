/**
 * Copy pdf.js worker from node_modules to public/pdfjs/
 * Runs on postinstall so Render and other deploys get the worker without CDN.
 */
const fs = require("fs");
const path = require("path");

const src = path.join(
  __dirname,
  "..",
  "node_modules",
  "pdfjs-dist",
  "legacy",
  "build",
  "pdf.worker.min.mjs"
);
const destDir = path.join(__dirname, "..", "public", "pdfjs");
const dest = path.join(destDir, "pdf.worker.min.mjs");

if (fs.existsSync(src)) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("Copied pdf.worker.min.mjs to public/pdfjs/");
} else {
  console.warn("pdf.worker.min.mjs not found at", src);
}
