/** Signature template options (matches WPF Signer). */
export interface SignatureTemplate {
  id: string;
  displayName: string;
  previewText: string;
  /** Show green tick icon in template card */
  showTick?: boolean;
  /** Show seal/stamp image upload for this template */
  showSealUpload?: boolean;
}

export const SIGNATURE_TEMPLATES: SignatureTemplate[] = [
  { id: "valid", displayName: "Valid", previewText: "✓ Đã xác thực", showTick: true },
  { id: "seal", displayName: "Con dấu", previewText: "Con dấu + Tên công ty", showSealUpload: true },
];
