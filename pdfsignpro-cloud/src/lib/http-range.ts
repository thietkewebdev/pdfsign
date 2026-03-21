/**
 * Parse a single Range header value (RFC 7233) for GET /file.
 * @param total - object size in bytes (must be > 0)
 */
export function parseBytesRange(
  rangeHeader: string,
  total: number
): { start: number; end: number } | null {
  if (total <= 0) return null;
  if (!rangeHeader.startsWith("bytes=")) return null;
  const spec = rangeHeader.slice(6).split(",")[0]?.trim();
  if (!spec) return null;
  const dash = spec.indexOf("-");
  if (dash < 0) return null;
  const startStr = spec.slice(0, dash);
  const endStr = spec.slice(dash + 1);

  if (startStr === "" && endStr !== "") {
    const suffix = parseInt(endStr, 10);
    if (Number.isNaN(suffix) || suffix <= 0) return null;
    if (suffix >= total) return { start: 0, end: total - 1 };
    return { start: total - suffix, end: total - 1 };
  }

  const start = startStr === "" ? 0 : parseInt(startStr, 10);
  if (Number.isNaN(start) || start < 0 || start >= total) return null;

  const end = endStr === "" ? total - 1 : parseInt(endStr, 10);
  if (Number.isNaN(end)) return null;
  const endClamped = Math.min(end, total - 1);
  if (endClamped < start) return null;
  return { start, end: endClamped };
}
