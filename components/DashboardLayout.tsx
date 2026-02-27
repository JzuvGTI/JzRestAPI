"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FaChartLine,
  FaCode,
  FaFileInvoiceDollar,
  FaKey,
  FaSignOutAlt,
  FaTimes,
  FaUserFriends,
  FaUserCircle,
  FaUserShield,
} from "react-icons/fa";

import Button from "@/components/Button";

type DashboardLayoutProps = {
  children: React.ReactNode;
  userName?: string | null;
  userEmail: string;
  userAvatarUrl?: string | null;
  userPlan: "FREE" | "PAID" | "RESELLER";
  userRole: "USER" | "SUPERADMIN";
};

type BanState = {
  blocked: boolean;
  permanent: boolean;
  reason: string | null;
  until: string | null;
  remainingText: string | null;
  message: string | null;
};

const planClasses: Record<DashboardLayoutProps["userPlan"], string> = {
  FREE: "bg-zinc-700/60 text-zinc-100",
  PAID: "bg-emerald-600/70 text-emerald-50",
  RESELLER: "bg-amber-500/80 text-amber-950",
};

export default function DashboardLayout({
  children,
  userEmail,
  userName,
  userAvatarUrl,
  userPlan,
  userRole,
}: DashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [banState, setBanState] = useState<BanState | null>(null);
  const pathname = usePathname();

  const sidebarItems = [
    { href: "/dashboard", label: "Dashboard", icon: FaChartLine },
    { href: "/dashboard/profile", label: "Profile", icon: FaUserCircle },
    { href: "/dashboard/apis", label: "REST API LIST", icon: FaCode },
    { href: "/dashboard/api-keys", label: "Manage API KEY", icon: FaKey },
    { href: "/dashboard/billing", label: "Billing", icon: FaFileInvoiceDollar },
    { href: "/dashboard/referral", label: "Referral Program", icon: FaUserFriends },
    ...(userRole === "SUPERADMIN"
      ? [{ href: "/dashboard/admin", label: "Super Admin", icon: FaUserShield }]
      : []),
  ];

  useEffect(() => {
    let stopped = false;

    const checkBanStatus = async () => {
      try {
        const response = await fetch("/api/account/status", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok || stopped) {
          return;
        }

        const data = (await response.json()) as BanState;
        if (stopped) {
          return;
        }

        setBanState(data.blocked ? data : null);
      } catch {
        if (!stopped) {
          setBanState(null);
        }
      }
    };

    checkBanStatus();
    const interval = setInterval(checkBanStatus, 10000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden text-zinc-100">
      {isSidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      ) : null}

      {banState?.blocked ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-zinc-950 p-6 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.16em] text-red-400">Account Blocked</p>
            <h3 className="mt-2 text-xl font-semibold text-zinc-100">Akun kamu telah diblokir.</h3>
            <p className="mt-2 text-sm text-zinc-300">{banState.message || "Silakan hubungi admin."}</p>
            {banState.reason ? <p className="mt-2 text-sm text-zinc-400">Reason: {banState.reason}</p> : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => signOut({ callbackUrl: "/login?blocked=1" })}
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 w-72 border-r border-zinc-800/80 bg-zinc-950/95 p-4 backdrop-blur",
          "transition-transform duration-300 md:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-full flex-col overflow-y-auto pr-1">
          <div className="mb-6 flex items-start justify-between gap-2 md:block">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">api.jzuv.my.id</p>
              <h2 className="mt-2 text-lg font-semibold text-zinc-100">JzREST API Panel</h2>
            </div>
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 md:hidden"
              onClick={() => setIsSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <FaTimes className="text-sm" />
            </button>
          </div>

          <nav className="space-y-2">
            {sidebarItems.map((item) => {
              const isActive =
                item.href === "/dashboard"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={[
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-200",
                    isActive
                      ? "bg-zinc-100 text-zinc-900"
                      : "text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100",
                  ].join(" ")}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <Icon className="text-sm" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Current plan</p>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${planClasses[userPlan]}`}>
              {userPlan}
            </span>
            <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">Role</p>
            <span className="mt-2 inline-flex rounded-full bg-zinc-800/80 px-2.5 py-1 text-xs font-semibold text-zinc-100">
              {userRole}
            </span>
            <p className="mt-3 text-xs text-zinc-400">Kelola limit, API, referral, dan akses akun dari panel ini.</p>
          </div>
        </div>
      </aside>

      <div className="min-h-screen md:pl-72">
        <div className="flex min-h-screen min-w-0 flex-col">
          <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/80 px-4 py-4 backdrop-blur md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  className="inline-flex size-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/80 text-zinc-200 transition-colors hover:bg-zinc-800 md:hidden"
                  onClick={() => setIsSidebarOpen((open) => !open)}
                  aria-label="Open sidebar"
                >
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <div className="min-w-0">
                  <p className="text-xs text-zinc-500 sm:text-sm">Welcome back</p>
                  <h1 className="max-w-[55vw] truncate text-sm font-semibold text-zinc-100 sm:text-base">
                    {userName || userEmail}
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <Link
                  href="/dashboard/profile"
                  className="inline-flex size-10 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-900/80 transition-colors hover:bg-zinc-800"
                  aria-label="Open profile"
                >
                  {userAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={userAvatarUrl} alt="Profile avatar" className="size-full object-cover" />
                  ) : (
                    <span className="text-xs font-semibold text-zinc-200">
                      {(userName || userEmail).trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </Link>

                <Button
                  variant="secondary"
                  className="h-10 px-3 sm:px-4"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  <span className="inline-flex items-center gap-2">
                    <FaSignOutAlt className="text-xs" />
                    Logout
                  </span>
                </Button>
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 overflow-x-hidden px-4 pb-6 pt-5 sm:px-5 md:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
