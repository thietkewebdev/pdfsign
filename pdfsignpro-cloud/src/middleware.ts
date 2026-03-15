import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const isLoggedIn = !!req.auth?.user;
  const isAdminPath = pathname.startsWith("/admin");

  if (!isLoggedIn) {
    const callbackPath = `${pathname}${search ?? ""}`;
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", callbackPath);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminPath && !isAdminEmail(req.auth?.user?.email)) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/contract/create", "/admin/:path*"],
};
