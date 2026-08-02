"use client";

import Link from "next/link";
import {
  Download,
  CheckCircle2,
  Monitor,
  Shield,
  Usb,
  Plug,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SIGNER_VERSION = "1.0.4";

const STEPS = [
  {
    icon: Download,
    title: "Tải Setup",
    desc: "Bấm nút tải và lưu PDFSignProSignerSetup.exe (khoảng ~80–90MB, đã kèm .NET).",
  },
  {
    icon: Shield,
    title: "Chạy Setup (có thể bị SmartScreen)",
    desc: 'Nếu Windows chặn: bấm "More info" → "Run anyway". Chrome: Keep file nếu bị cảnh báo tải xuống.',
  },
  {
    icon: User,
    title: "Cài cho tài khoản Windows hiện tại",
    desc: "Không cần quyền Administrator. Cài vào thư mục user (LocalAppData) và đăng ký pdfsignpro://.",
  },
  {
    icon: Usb,
    title: "Cắm USB Token + driver PKCS#11",
    desc: "Cài middleware từ nhà cung cấp CA (Viettel, VNPT, FPT, BKAV…). Cắm token trước khi ký.",
  },
  {
    icon: CheckCircle2,
    title: "Quay lại web, bấm Ký số",
    desc: "Trên trang tài liệu, bấm 'Ký số' — trình duyệt mở Signer, nhập PIN và hoàn tất.",
  },
] as const;

export default function SignerPage() {
  return (
    <div className="container mx-auto max-w-2xl px-6 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          PDFSignPro Signer (Windows)
        </h1>
        <p className="mt-2 text-muted-foreground">
          Ứng dụng ký số PDF PAdES bằng USB Token trên Windows
        </p>
        <p className="mt-1 text-sm text-muted-foreground/80">
          Cài per-user · không cần admin · tự đăng ký pdfsignpro://
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Phiên bản {SIGNER_VERSION}
        </p>
      </header>

      <div className="space-y-6">
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Hướng dẫn cài đặt</CardTitle>
            <CardDescription>
              Làm theo các bước dưới đây — chỉ dùng file Setup, không dùng bản
              portable
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {STEPS.map((step, i) => (
              <div key={step.title} className="flex gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <step.icon className="size-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    Bước {i + 1}: {step.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Button size="lg" asChild>
            <a href="/api/signer/download">
              <Download className="mr-2 size-4" />
              Tải PDFSignProSignerSetup.exe
            </a>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Quay lại trang chủ</Link>
          </Button>
        </div>

        <Card className="border-emerald-200/80 bg-emerald-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="size-5 text-emerald-700" />
              Vì sao phải cài Setup?
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Setup đăng ký giao thức{" "}
            <code className="rounded bg-muted px-1 text-xs">pdfsignpro://</code>{" "}
            để trình duyệt mở Signer khi bạn bấm Ký. Chạy file portable không qua
            Setup sẽ không đăng ký được liên kết này.
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="size-5" />
              Xử lý sự cố
            </CardTitle>
            <CardDescription>
              Một số vấn đề thường gặp khi cài đặt và sử dụng
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <details className="group rounded-lg border border-border p-3">
                <summary className="cursor-pointer font-medium text-foreground">
                  Token driver / PKCS#11 không nhận
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  Cài driver/middleware từ nhà cung cấp token (Viettel, VNPT,
                  Bkav, FPT…). Đảm bảo token được nhận trong Device Manager. Trên
                  trang ký, mục &quot;Sẵn sàng ký&quot; sẽ báo nếu chưa thấy
                  PKCS#11.
                </p>
              </details>
              <details className="group rounded-lg border border-border p-3">
                <summary className="cursor-pointer font-medium text-foreground">
                  Windows SmartScreen / Chrome chặn file
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  Bấm &quot;More info&quot; → &quot;Run anyway&quot;. Chrome: mũi
                  tên ▼ → Keep. Ứng dụng chưa ký Authenticode nên Windows có thể
                  cảnh báo — đây là hành vi bình thường với phần mềm mới.
                </p>
              </details>
              <details className="group rounded-lg border border-border p-3">
                <summary className="cursor-pointer font-medium text-foreground">
                  Có cần quyền Administrator không?
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  Bản 1.0.4+ cài per-user, không cần admin. Nếu máy còn bản cũ
                  (Program Files), hãy gỡ trong Settings → Apps rồi cài lại Setup
                  mới.
                </p>
              </details>
              <details className="group rounded-lg border border-border p-3">
                <summary className="cursor-pointer font-medium text-foreground">
                  Bấm Ký nhưng Signer không mở
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  Cài lại PDFSignProSignerSetup.exe để đăng ký lại{" "}
                  <code className="rounded bg-muted px-1 text-xs">
                    pdfsignpro://
                  </code>
                  . Mở Signer từ Start Menu một lần, rồi ký lại trên web.
                </p>
              </details>
              <details className="group rounded-lg border border-border p-3">
                <summary className="cursor-pointer font-medium text-foreground">
                  Antivirus / Firewall
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  Whitelist PDFSignPro Signer. Firewall cần cho phép app kết nối
                  tới pdfsign.vn để tải PDF và upload bản đã ký. Bridge local chỉ
                  lắng nghe 127.0.0.1:17886.
                </p>
              </details>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
