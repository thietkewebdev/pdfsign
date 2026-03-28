"use client";

import { Download, Usb, Link2, KeyRound, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const steps = [
  {
    icon: Usb,
    title: "Cắm USB Token",
    body: "Cắm token vào máy tính Windows. Đảm bảo driver/token được nhận (đèn hoặc phần mềm token).",
  },
  {
    icon: Link2,
    title: "Mở liên kết ký từ web",
    body: "Trên trang này, bấm Ký số — trình duyệt mở ứng dụng PDFSignPro Signer qua giao thức pdfsignpro://. Nếu không mở được, xem mục tải Signer bên dưới.",
  },
  {
    icon: KeyRound,
    title: "Nhập PIN trong Signer",
    body: "Trong cửa sổ Signer, nhập mã PIN token rồi bấm Ký số. Khóa ký không rời USB; file được ký cục bộ rồi gửi lên hệ thống.",
  },
  {
    icon: CheckCircle2,
    title: "Hoàn tất trên web",
    body: "Sau khi ký xong, quay lại tab trình duyệt để xem trạng thái đã ký và tải PDF (nếu cần).",
  },
];

export function SigningFlowGuideDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-left text-lg">
            Cách ký bằng USB Token
          </DialogTitle>
          <DialogDescription className="text-left text-sm text-muted-foreground">
            Quy trình ngắn gọn từ web PDFSignPro tới PDFSignPro Signer trên máy
            bạn.
          </DialogDescription>
        </DialogHeader>
        <ol className="mt-2 space-y-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <div className="flex items-center gap-2">
                  <s.icon className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="font-semibold text-foreground">{s.title}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="rounded-lg border border-amber-200/80 bg-amber-50/90 p-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          <strong className="font-semibold">Chưa cài Signer?</strong> Tải bản cài
          Windows (PDFSignProSignerSetup) — cần thiết để đăng ký liên kết{" "}
          <code className="rounded bg-black/5 px-1 text-xs dark:bg-white/10">
            pdfsignpro://
          </code>{" "}
          và ký cục bộ.
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button
            type="button"
            onClick={() => {
              window.open("/api/signer/download", "_blank", "noopener,noreferrer");
            }}
          >
            <Download className="size-4" />
            Tải PDFSignPro Signer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
