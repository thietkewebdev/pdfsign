/**
 * URL passed to PDF.js.
 *
 * Default (same as original app): same-origin proxy `/api/documents/.../file` first — avoids R2 CORS
 * and matches historical behavior.
 *
 * Set NEXT_PUBLIC_PDF_DIRECT_R2=1 to load via presigned URL (browser → R2/S3 directly). Requires
 * bucket CORS to allow your app origin; can be faster depending on region/network.
 */
export function getPdfViewerUrl(
  presignedUrl: string,
  viewUrl?: string | null
): string {
  const directR2 = process.env.NEXT_PUBLIC_PDF_DIRECT_R2 === "1";
  if (directR2 && presignedUrl) return presignedUrl;
  return viewUrl ?? presignedUrl;
}
