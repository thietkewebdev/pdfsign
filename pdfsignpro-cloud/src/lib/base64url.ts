/**
 * Base64url encode: standard base64 with URL-safe replacements (+ → -, / → _)
 * and no padding (omit =).
 */
export function base64urlEncode(data: string | object): string {
  const str = typeof data === "string" ? data : JSON.stringify(data);
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
