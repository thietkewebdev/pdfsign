/**
 * URL passed to PDF.js. Prefer presigned GET (browser → R2/S3) — fastest.
 * Proxy URL `/api/documents/.../file` loads the whole file through Next.js (slow, high server RAM).
 *
 * Set NEXT_PUBLIC_PDF_USE_PROXY=1 if your bucket CORS does not allow your app origin
 * (PDF.js fetch will fail without CORS on direct URLs).
 */
export function getPdfViewerUrl(
  presignedUrl: string,
  viewUrl?: string | null
): string {
  const useProxy = process.env.NEXT_PUBLIC_PDF_USE_PROXY === "1";
  if (useProxy && viewUrl) return viewUrl;
  if (presignedUrl) return presignedUrl;
  return viewUrl ?? "";
}
