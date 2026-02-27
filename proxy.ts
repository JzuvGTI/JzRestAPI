import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/auth";

const AUTH_PAGES = new Set(["/login", "/register"]);

export const proxy = auth((request: NextRequest & { auth: { user?: { role?: string } } | null }) => {
  const isAuthenticated = Boolean(request.auth?.user);
  const { pathname } = request.nextUrl;
  const isDashboardRoute = pathname.startsWith("/dashboard");
  const isAdminRoute = pathname.startsWith("/dashboard/admin");
  const isBlockedLoginNotice = request.nextUrl.searchParams.get("blocked") === "1";

  if (!isAuthenticated && isDashboardRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && AUTH_PAGES.has(pathname) && !isBlockedLoginNotice) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isAuthenticated && isAdminRoute && request.auth?.user?.role !== "SUPERADMIN") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
