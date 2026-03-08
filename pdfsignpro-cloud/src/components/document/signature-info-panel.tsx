"use client";

import { Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface SignInfo {
  signedBy?: string;
  issuerCN?: string;
  signingTime?: string;
}

interface SignatureInfoPanelProps {
  signInfo: SignInfo | null | undefined;
  className?: string;
}

/** Format ISO time to dd/MM/yyyy HH:mm (VN) */
function formatSigningTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const MM = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const HH = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${MM}/${yyyy} ${HH}:${mm}`;
  } catch {
    return iso;
  }
}

export function SignatureInfoPanel({
  signInfo,
  className = "",
}: SignatureInfoPanelProps) {
  const hasAny =
    signInfo &&
    (signInfo.signedBy || signInfo.issuerCN || signInfo.signingTime);
  if (!hasAny) return null;

  return (
    <div
      className={`rounded-lg border border-border bg-card p-4 space-y-3 shadow-sm ${className}`}
    >
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Shield className="size-4 text-muted-foreground" />
        Thông tin chứng thư số
      </h4>
      <dl className="space-y-2.5 text-sm">
        {signInfo.signedBy && (
          <div>
            <dt className="text-xs text-muted-foreground mb-0.5">Ký bởi</dt>
            <dd>
              <Badge variant="secondary" className="font-normal text-foreground">
                {signInfo.signedBy}
              </Badge>
            </dd>
          </div>
        )}
        {signInfo.issuerCN && (
          <div>
            <dt className="text-xs text-muted-foreground mb-0.5">
              CA phát hành
            </dt>
            <dd>
              <Badge variant="outline" className="font-normal">
                {signInfo.issuerCN}
              </Badge>
            </dd>
          </div>
        )}
        {signInfo.signingTime && (
          <div>
            <dt className="text-xs text-muted-foreground mb-0.5">
              Thời gian ký
            </dt>
            <dd className="font-medium text-foreground">
              {formatSigningTime(signInfo.signingTime)}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
