"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const authError = searchParams.get("error");
  const verifyStatus = searchParams.get("verify");
  const checkEmail = searchParams.get("checkEmail") === "1";
  const queryEmail = searchParams.get("email") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendEmail, setResendEmail] = useState(queryEmail);
  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState("");
  const errorMessage = useMemo(() => {
    if (!authError) return "";
    if (authError === "CredentialsSignin") {
      return "Email/mật khẩu không đúng hoặc tài khoản chưa xác thực email.";
    }
    return "Đăng nhập thất bại. Vui lòng thử lại.";
  }, [authError]);

  const verifyMessage = useMemo(() => {
    if (verifyStatus === "success") {
      return {
        text: "Xác thực email thành công. Bạn có thể đăng nhập ngay.",
        cls: "text-green-600 dark:text-green-400",
      };
    }
    if (verifyStatus === "expired") {
      return {
        text: "Link xác thực đã hết hạn hoặc đã dùng. Vui lòng gửi lại email xác thực.",
        cls: "text-amber-600 dark:text-amber-400",
      };
    }
    if (verifyStatus === "invalid") {
      return {
        text: "Link xác thực không hợp lệ.",
        cls: "text-red-600 dark:text-red-400",
      };
    }
    return null;
  }, [verifyStatus]);

  async function handleCredentialsLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      callbackUrl,
      redirect: true,
    });
    setLoading(false);
  }

  async function handleResendVerification(e: React.FormEvent) {
    e.preventDefault();
    setResendResult("");
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setResendResult(data?.error || "Không thể gửi lại email xác thực.");
        return;
      }
      setResendResult("Đã gửi lại email xác thực (nếu tài khoản tồn tại và chưa xác thực).");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Đăng nhập</CardTitle>
          <CardDescription>
            Đăng nhập hoặc tạo tài khoản để quản lý tài liệu và hợp đồng
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {checkEmail && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Tài khoản đã tạo. Vui lòng kiểm tra email để xác thực trước khi đăng nhập.
            </p>
          )}
          {verifyMessage && (
            <p className={`text-xs ${verifyMessage.cls}`}>{verifyMessage.text}</p>
          )}
          <form onSubmit={handleCredentialsLogin} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {errorMessage && (
              <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
            )}
            <Button className="w-full" size="lg" type="submit" disabled={loading}>
              {loading ? "Đang đăng nhập..." : "Đăng nhập bằng email"}
            </Button>
          </form>

          {(checkEmail || verifyStatus === "expired") && (
            <form onSubmit={handleResendVerification} className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-medium">Gửi lại email xác thực</p>
              <Input
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
              <Button type="submit" variant="outline" size="sm" disabled={resending}>
                {resending ? "Đang gửi..." : "Gửi lại email xác thực"}
              </Button>
              {resendResult && (
                <p className="text-xs text-muted-foreground">{resendResult}</p>
              )}
            </form>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Hoặc</span>
            </div>
          </div>

          <Button
            className="w-full gap-2"
            size="lg"
            variant="outline"
            onClick={() => signIn("google", { callbackUrl })}
          >
            <svg className="size-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Đăng nhập bằng Google
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Chưa có tài khoản?{" "}
            <Link
              href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="font-medium text-primary hover:underline"
            >
              Đăng ký
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center" />}>
      <LoginForm />
    </Suspense>
  );
}
