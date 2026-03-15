"use client";

<<<<<<< HEAD
import { useState } from "react";
import Link from "next/link";
=======
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
>>>>>>> 498c8d4 (feat: add email/password signup and login flow)
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
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl: "/dashboard",
      });
      if (res?.error) {
        setError("Email hoặc mật khẩu không đúng.");
        return;
      }
      if (res?.url) window.location.href = res.url;
    } finally {
      setLoading(false);
    }
  }

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const errorMessage = useMemo(() => {
    if (!authError) return "";
    if (authError === "CredentialsSignin") return "Email hoặc mật khẩu không đúng.";
    return "Đăng nhập thất bại. Vui lòng thử lại.";
  }, [authError]);

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
<<<<<<< HEAD
          {registered && (
            <p className="text-center text-sm text-green-600 dark:text-green-400">
              Đăng ký thành công. Vui lòng đăng nhập.
            </p>
          )}
          <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            <div className="space-y-2">
=======
          <form onSubmit={handleCredentialsLogin} className="space-y-3">
            <div className="space-y-1.5">
>>>>>>> 498c8d4 (feat: add email/password signup and login flow)
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
<<<<<<< HEAD
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
=======
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-1.5">
>>>>>>> 498c8d4 (feat: add email/password signup and login flow)
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
<<<<<<< HEAD
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Đang đăng nhập..." : "Đăng nhập bằng email"}
            </Button>
          </form>
          <div className="relative">
            <span className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </span>
            <span className="relative flex justify-center text-xs uppercase text-muted-foreground">
              hoặc
            </span>
          </div>
=======
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

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Hoặc</span>
            </div>
          </div>

>>>>>>> 498c8d4 (feat: add email/password signup and login flow)
          <Button
            className="w-full gap-2"
            size="lg"
            variant="outline"
<<<<<<< HEAD
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
=======
            onClick={() => signIn("google", { callbackUrl })}
>>>>>>> 498c8d4 (feat: add email/password signup and login flow)
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
<<<<<<< HEAD
            <Link href="/register" className="underline text-foreground">
=======
            <Link
              href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="font-medium text-primary hover:underline"
            >
>>>>>>> 498c8d4 (feat: add email/password signup and login flow)
              Đăng ký
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
