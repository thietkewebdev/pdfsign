"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Footer } from "@/components/footer";
import { useTheme } from "next-themes";
import { useSession, signOut } from "next-auth/react";
import {
  Moon,
  Sun,
  Monitor,
  Laptop,
  ChevronDown,
  LogIn,
  FileText,
  LogOut,
  HelpCircle,
  Scale,
  ShieldCheck,
  Users,
  FilePlus,
  LayoutDashboard,
} from "lucide-react";
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

const NAV_LINKS = [
  { href: "/", label: "Trang chủ", match: (p: string) => p === "/" },
  { href: "/#why-pdfsign", label: "Tính năng", match: () => false },
  { href: "/#pricing", label: "Bảng giá", match: () => false },
  { href: "/privacy", label: "Bảo mật", match: (p: string) => p.startsWith("/privacy") },
  { href: "/blog", label: "Hướng dẫn", match: (p: string) => p.startsWith("/blog") },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { theme, setTheme } = useTheme();
  const { data: session, status } = useSession();
  const hasOffline = !!process.env.NEXT_PUBLIC_OFFLINE_APP_URL;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-blue-100 bg-white/95 shadow-sm backdrop-blur-md">
        <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
          <Link
            href="/"
            className="shrink-0 text-xl font-black tracking-tighter text-stitch-primary"
          >
            pdfsign.vn
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {NAV_LINKS.map(({ href, label, match }) => {
              const active = match(pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "text-sm font-medium tracking-tight transition-colors",
                    active
                      ? "border-b-2 border-stitch-primary pb-0.5 font-bold text-stitch-primary"
                      : "text-[#4a6080] hover:text-stitch-primary"
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="group relative hidden lg:block">
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium",
                  "text-[#4a6080] hover:bg-blue-50/80 hover:text-stitch-primary"
                )}
                aria-haspopup="true"
              >
                Thêm
                <ChevronDown className="size-4 opacity-70" />
              </button>
              <div className="absolute right-0 top-full z-50 pt-1 opacity-0 transition-opacity pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto">
                <div className="min-w-[220px] rounded-lg border border-border bg-popover py-1 shadow-lg">
                  <Link
                    href="/signer"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent"
                  >
                    <Monitor className="size-4 shrink-0" />
                    Tải phần mềm ký online
                  </Link>
                  {hasOffline && (
                    <Link
                      href="/offline"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent"
                    >
                      <Laptop className="size-4 shrink-0" />
                      Phần mềm ký offline
                    </Link>
                  )}
                  <Link
                    href="/faq"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent"
                  >
                    <HelpCircle className="size-4 shrink-0" />
                    Câu hỏi thường gặp
                  </Link>
                  <div className="my-1 border-t border-border" />
                  <Link
                    href="/terms"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent"
                  >
                    <Scale className="size-4 shrink-0" />
                    Điều khoản dịch vụ
                  </Link>
                  <Link
                    href="/privacy"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent"
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
                    aria-label="Đổi giao diện"
                    className="text-[#4a6080]"
                  >
                    <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Đổi giao diện</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {status === "authenticated" && session?.user ? (
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
                      <div className="flex size-7 items-center justify-center rounded-full bg-stitch-primary text-xs font-medium text-white">
                        {(session.user.name ?? session.user.email ?? "U").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{session.user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
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
                  {session.user.isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="cursor-pointer">
                        <LayoutDashboard className="size-4" />
                        Quản trị hệ thống
                      </Link>
                    </DropdownMenuItem>
                  )}
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
            ) : status === "unauthenticated" ? (
              <Button variant="ghost" size="sm" asChild className="font-medium text-stitch-primary">
                <Link href="/login" className="gap-1.5" aria-label="Đăng nhập">
                  <LogIn className="size-4 shrink-0" />
                  <span className="hidden sm:inline">Đăng nhập</span>
                </Link>
              </Button>
            ) : null}
            <Button size="sm" className="hero-gradient-stitch shrink-0 px-3 text-sm font-medium text-white shadow-md sm:px-4" asChild>
              <Link href="/#upload">Dùng thử miễn phí</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
