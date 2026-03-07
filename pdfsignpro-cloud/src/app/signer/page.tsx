"use client";

import Link from "next/link";
import {
  Download,
  CheckCircle2,
  Monitor,
  Shield,
  Usb,
  Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SIGNER_VERSION = "1.0.0";

const STEPS = [
  {
    icon: Download,
    title: "Tải file .exe",
    desc: "Bấm nút tải và lưu PDFSignProSigner.exe vào máy.",
  },
  {
    icon: Monitor,
    title: "Chạy file",
    desc: "Double-click file .exe để chạy. Không cần cài đặt (portable).",
  },
  {
    icon: Shield,
    title: "Windows SmartScreen (nếu có)",
    desc: 'Nếu Windows chặn: bấm "More info" → "Run anyway" để tiếp tục.',
  },
  {
    icon: Usb,
    title: "Cắm USB token",
    desc: "Cắm token ký số (VNPKI, Viettel CA, v.v.) và cài driver nếu cần.",
  },
  {
    icon: CheckCircle2,
    title: "Quay lại web, bấm Ký số",
    desc: "Trên trang tài liệu, bấm nút 'Ký số' để tạo deep link. Ứng dụng sẽ mở và ký PDF.",
  },
];

export default function SignerPage() {
  return (
    <div className="container mx-auto max-w-2xl px-6 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          PDFSignPro Signer (Windows)
        </h1>
        <p className="mt-2 text-muted-foreground">
          Ứng dụng ký số PDF PAdES trên máy tính Windows
        </p>
        <p className="mt-1 text-sm text-muted-foreground/80">
          Chỉ hỗ trợ Windows (USB token)
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
              Làm theo 5 bước dưới đây để ký tài liệu PDF
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {STEPS.map((step, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <step.icon className="size-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    Bước {i + 1}: {step.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Button size="lg" asChild>
            <a href="/api/signer/download">
              <Download className="mr-2 size-4" />
              Tải PDFSignPro Signer (Windows)
            </a>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Quay lại trang chủ</Link>
          </Button>
        </div>

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
                  Cài driver từ nhà cung cấp token (VNPKI, Viettel, VNPT, Bkav,
                  FPT, v.v.). Đảm bảo token được nhận trong Device Manager. Một
                  số token cần cài thêm middleware PKCS#11.
                </p>
              </details>
              <details className="group rounded-lg border border-border p-3">
                <summary className="cursor-pointer font-medium text-foreground">
                  Windows SmartScreen chặn file
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  Bấm &quot;More info&quot; → &quot;Run anyway&quot;. Ứng dụng
                  chưa được ký bởi nhà phát hành nên Windows có thể cảnh báo.
                </p>
              </details>
              <details className="group rounded-lg border border-border p-3">
                <summary className="cursor-pointer font-medium text-foreground">
                  Antivirus xóa hoặc chặn file
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  Thêm PDFSignPro Signer vào danh sách ngoại lệ (whitelist).
                  Windows Defender: Settings → Virus & threat protection →
                  Exclusions → Add exclusion.
                </p>
              </details>
              <details className="group rounded-lg border border-border p-3">
                <summary className="cursor-pointer font-medium text-foreground">
                  Yêu cầu quyền Administrator
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  Chạy chuột phải → &quot;Run as administrator&quot;. Hoặc cài
                  vào thư mục người dùng nếu không muốn dùng quyền admin.
                </p>
              </details>
              <details className="group rounded-lg border border-border p-3">
                <summary className="cursor-pointer font-medium text-foreground">
                  Firewall chặn kết nối
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  Cho phép PDFSignPro Signer qua Windows Firewall. Ứng dụng cần
                  kết nối tới PDFSignPro Cloud để tải PDF và upload bản đã ký.
                </p>
              </details>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
