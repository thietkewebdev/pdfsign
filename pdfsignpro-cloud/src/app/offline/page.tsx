import type { Metadata } from "next";
import Link from "next/link";
import {
  Download,
  Shield,
  AlertTriangle,
  CheckCircle2,
  FileCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "PDFSignPro Offline",
  description:
    "Tải ứng dụng PDFSignPro Offline cho Windows. Ký số PDF offline, không cần trình duyệt.",
};

const CHROME_SMARTSCREEN_STEPS = [
  {
    icon: Download,
    title: "Tải file",
    desc: "Bấm nút tải bên dưới. Chrome/Edge có thể hiện cảnh báo 'File không thường được tải xuống'.",
  },
  {
    icon: AlertTriangle,
    title: "Giữ file (nếu Chrome cảnh báo)",
    desc: "Bấm mũi tên ▼ bên cạnh file trong thanh tải xuống → chọn 'Keep' / 'Giữ lại' để lưu file.",
  },
  {
    icon: Shield,
    title: "Windows SmartScreen (khi chạy)",
    desc: 'Nếu Windows chặn khi mở file: bấm "More info" → "Run anyway" / "Vẫn chạy". Ứng dụng chưa được ký bởi nhà phát hành nên có thể bị cảnh báo.',
  },
  {
    icon: CheckCircle2,
    title: "Cài đặt",
    desc: "Chạy file .exe và làm theo hướng dẫn cài đặt.",
  },
] as const;

export default function OfflinePage() {
  const sha256 = process.env.OFFLINE_SHA256?.trim();

  return (
    <div className="container mx-auto max-w-2xl px-6 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          PDFSignPro Offline
        </h1>
        <p className="mt-2 text-muted-foreground">
          Ứng dụng Windows ký số PDF độc lập — không cần trình duyệt
        </p>
        <p className="mt-1 text-sm text-muted-foreground/80">
          Phù hợp môi trường nội bộ, mạng kín
        </p>
      </header>

      <div className="space-y-6">
        {/* Download button */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Tải cài đặt</CardTitle>
            <CardDescription>
              PDFSignPro_Setup.exe — trình cài đặt cho Windows
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button size="lg" asChild>
                <a href="/api/download/offline">
                  <Download className="mr-2 size-4" />
                  Tải PDFSignPro Offline
                </a>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/">Quay lại trang chủ</Link>
              </Button>
            </div>

            {/* SHA-256 checksum */}
            {sha256 && (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <FileCheck className="size-4 shrink-0" />
                  SHA-256
                </div>
                <code className="mt-2 block break-all font-mono text-xs text-muted-foreground">
                  {sha256}
                </code>
                <p className="mt-2 text-xs text-muted-foreground">
                  Dùng lệnh <code className="rounded bg-muted px-1">certutil -hashfile PDFSignPro_Setup.exe SHA256</code> trên Windows để kiểm tra.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chrome warning explanation */}
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-5" />
              Cảnh báo từ Chrome / Edge
            </CardTitle>
            <CardDescription>
              Trình duyệt có thể hiện cảnh báo khi tải file .exe — đây là hành vi bình thường
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Chrome và Edge thường cảnh báo &quot;File không thường được tải xuống&quot; hoặc &quot;This file isn&apos;t commonly downloaded&quot; khi tải file .exe từ nguồn chưa được xác minh.
            </p>
            <p>
              <strong className="text-foreground">Cách xử lý:</strong> Bấm mũi tên ▼ bên cạnh file trong thanh tải xuống (góc dưới trình duyệt) → chọn &quot;Keep&quot; / &quot;Giữ lại&quot; để lưu file. File tải xuống hoàn toàn an toàn.
            </p>
          </CardContent>
        </Card>

        {/* Chrome SmartScreen steps */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Hướng dẫn tải và cài đặt</CardTitle>
            <CardDescription>
              Làm theo các bước dưới đây nếu gặp cảnh báo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {CHROME_SMARTSCREEN_STEPS.map((step, i) => (
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
      </div>
    </div>
  );
}
