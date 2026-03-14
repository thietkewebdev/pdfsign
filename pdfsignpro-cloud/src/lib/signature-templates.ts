/** Signature template options (matches WPF Signer). */
export interface SignatureTemplate {
  id: string;
  displayName: string;
  previewText: string;
  /** Show green tick icon in template card */
  showTick?: boolean;
}

export const SIGNATURE_TEMPLATES: SignatureTemplate[] = [
  { id: "classic", displayName: "Classic", previewText: "Nguyễn Văn A · 10/12/2026" },
  { id: "modern", displayName: "Modern", previewText: "Nguyễn Văn A · Giám đốc" },
  { id: "minimal", displayName: "Minimal", previewText: "Nguyễn Văn A" },
  { id: "stamp", displayName: "Stamp", previewText: "Đã ký số · 10/12/2026" },
  { id: "valid", displayName: "Valid", previewText: "✓ Đã xác thực", showTick: true },
];
