"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Footer } from "@/components/footer";
import { useTheme } from "next-themes";
<<<<<<< HEAD
import { useSession, signIn, signOut } from "next-auth/react";
import { Moon, Sun, Github, Monitor, Laptop, ChevronDown, LogIn, FileText, LogOut, HelpCircle, Scale, ShieldCheck, BookOpen, Users, FilePlus, BarChart3 } from "lucide-react";
=======
import { useSession, signOut } from "next-auth/react";
import { Moon, Sun, Github, Monitor, Laptop, ChevronDown, LogIn, FileText, LogOut, HelpCircle, Scale, ShieldCheck, BookOpen, Users, FilePlus } from "lucide-react";
>>>>>>> 498c8d4 (feat: add email/password signup and login flow)
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function UsagePill() {
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setUsage({ used: d.used, limit: d.limit }))
      .catch(() => {});
  }, []);
  if (!usage) return null;
  const pct = usage.limit > 0 ? (usage.used / usage.limit) * 100 : 0;
  const isWarning = pct >= 80;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/dashboard?tab=usage"
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              isWarning
                ? "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
          >
            <BarChart3 className="size-3.5" />
            <span>{usage.used}/{usage.limit}</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent>
          <p>File ký trong tháng (gói Free)</p>
          <p className="text-xs text-muted-foreground">Bấm để xem chi tiết</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme();
  const { data: session, status } = useSession();
  const hasOffline = !!process.env.NEXT_PUBLIC_OFFLINE_APP_URL;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link
            href="/"
            className="font-semibold text-foreground hover:text-foreground/90 transition-colors duration-150"
          >
            PDFSignPro Cloud
          </Link>
          <div className="flex items-center gap-2">
            {/* Hướng dẫn dropdown */}
            <div className="group relative">
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                  "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                )}
                aria-haspopup="true"
                aria-expanded="false"
              >
                Hướng dẫn
                <ChevronDown className="size-4 opacity-70" />
              </button>
              <div className="absolute left-0 top-full pt-1 opacity-0 transition-opacity duration-150 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto">
                <div className="min-w-[220px] rounded-md border border-border bg-popover py-1 shadow-lg">
                  <Link
                    href="/signer"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <Monitor className="size-4 shrink-0" />
                    Tải phần mềm ký online
                  </Link>
                  {hasOffline && (
                    <Link
                      href="/offline"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <Laptop className="size-4 shrink-0" />
                      Tải phần mềm ký offline
                    </Link>
                  )}
                  <Link
                    href="/blog"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <BookOpen className="size-4 shrink-0" />
                    Blog & Hướng dẫn
                  </Link>
                  <Link
                    href="/faq"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <HelpCircle className="size-4 shrink-0" />
                    Câu hỏi thường gặp
                  </Link>
                  <div className="my-1 border-t border-border" />
                  <Link
                    href="/terms"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <Scale className="size-4 shrink-0" />
                    Điều khoản dịch vụ
                  </Link>
                  <Link
                    href="/privacy"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <ShieldCheck className="size-4 shrink-0" />
                    Chính sách bảo mật
                  </Link>
                </div>
              </div>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    aria-label="Toggle theme"
                  >
                    <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Đổi giao diện</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {status === "authenticated" && session?.user ? (
              <>
                <UsagePill />
                <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    {session.user.image ? (
                      <Image
                        src={session.user.image}
                        alt={session.user.name ?? "Avatar"}
                        width={28}
                        height={28}
                        className="rounded-full"
                      />
                    ) : (
                      <div className="size-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                        {(session.user.name ?? session.user.email ?? "U").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{session.user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="cursor-pointer">
                      <FileText className="size-4" />
                      Tài liệu của tôi
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/contract/create" className="cursor-pointer">
                      <FilePlus className="size-4" />
                      Tạo hợp đồng điện tử
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard?tab=contracts" className="cursor-pointer">
                      <Users className="size-4" />
                      Hợp đồng của tôi
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard?tab=usage" className="cursor-pointer">
                      <BarChart3 className="size-4" />
                      Gói & Sử dụng
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer text-destructive focus:text-destructive"
                    onClick={() => signOut()}
                  >
                    <LogOut className="size-4" />
                    Đăng xuất
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </>
            ) : status === "unauthenticated" ? (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Link href="/login">
                  <LogIn className="size-4" />
                  Đăng nhập
                </Link>
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" asChild aria-label="GitHub">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="size-4" />
              </a>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
