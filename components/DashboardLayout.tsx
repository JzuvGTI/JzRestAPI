"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FaChevronDown,
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

type SidebarItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type SidebarDropdownKey = "tools" | "account";

type SidebarDropdown = {
  key: SidebarDropdownKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: SidebarItem[];
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
  const [expandedSections, setExpandedSections] = useState<Record<SidebarDropdownKey, boolean>>({
    tools: true,
    account: false,
  });
  const pathname = usePathname();

  const topLevelItems: SidebarItem[] = [{ href: "/dashboard", label: "Dashboard", icon: FaChartLine }];
  const dropdownSections: SidebarDropdown[] = [
    {
      key: "tools",
      label: "API & Tools",
      icon: FaCode,
      items: [
        { href: "/dashboard/apis", label: "REST API LIST", icon: FaCode },
        { href: "/dashboard/api-keys", label: "Manage API KEY", icon: FaKey },
        { href: "/dashboard/billing", label: "Billing", icon: FaFileInvoiceDollar },
        { href: "/dashboard/referral", label: "Referral Program", icon: FaUserFriends },
      ],
    },
    {
      key: "account",
      label: "Account",
      icon: FaUserCircle,
      items: [{ href: "/dashboard/profile", label: "Profile", icon: FaUserCircle }],
    },
  ];

  const isRouteActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

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

  useEffect(() => {
    setExpandedSections((previous) => {
      const next = { ...previous };
      for (const section of dropdownSections) {
        if (section.items.some((item) => isRouteActive(item.href))) {
          next[section.key] = true;
        }
      }
      return next;
    });
  }, [pathname]);

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
        <div className="flex h-full min-h-0 flex-col">
          <div className="mb-4 flex items-start justify-between gap-2 md:block">
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

          <nav className="scrollbar-themed min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 pb-6">
            {topLevelItems.map((item) => {
              const isActive = isRouteActive(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
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

            {dropdownSections.map((section) => {
              const isExpanded = expandedSections[section.key];
              const isSectionActive = section.items.some((item) => isRouteActive(item.href));
              const SectionIcon = section.icon;

              return (
                <div key={section.key}>
                  <button
                    type="button"
                    className={[
                      "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-200",
                      isSectionActive
                        ? "bg-zinc-800/70 text-zinc-100"
                        : "text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100",
                    ].join(" ")}
                    onClick={() =>
                      setExpandedSections((previous) => ({
                        ...previous,
                        [section.key]: !previous[section.key],
                      }))
                    }
                    aria-expanded={isExpanded}
                    aria-controls={`sidebar-section-${section.key}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <SectionIcon className="text-sm" />
                      <span>{section.label}</span>
                    </span>
                    <FaChevronDown
                      className={[
                        "text-[10px] transition-transform duration-200",
                        isExpanded ? "rotate-180" : "rotate-0",
                      ].join(" ")}
                    />
                  </button>

                  <div
                    id={`sidebar-section-${section.key}`}
                    className={[
                      "overflow-hidden transition-all duration-200",
                      isExpanded ? "max-h-[420px] opacity-100" : "max-h-0 opacity-0",
                    ].join(" ")}
                  >
                    <div className="relative ml-5 mt-1 pl-3">
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-0 top-0 bottom-0 w-px bg-zinc-700/80"
                      />
                      <div className="space-y-1">
                        {section.items.map((item, index) => {
                          const isActive = isRouteActive(item.href);
                          const Icon = item.icon;

                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              tabIndex={isExpanded ? 0 : -1}
                              aria-hidden={!isExpanded}
                              style={{
                                transitionDelay: isExpanded ? `${index * 40}ms` : "0ms",
                              }}
                              className={[
                                "group relative flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm",
                                "transition-[opacity,transform,background-color,color] duration-200 ease-out",
                                isExpanded ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0",
                                isActive
                                  ? "bg-zinc-100 text-zinc-900"
                                  : "text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100",
                              ].join(" ")}
                              onClick={() => setIsSidebarOpen(false)}
                            >
                              <span
                                aria-hidden
                                className={[
                                  "pointer-events-none absolute -left-3 top-1/2 h-px w-3 -translate-y-1/2",
                                  isActive ? "bg-zinc-300/80" : "bg-zinc-700/80 group-hover:bg-zinc-500/80",
                                ].join(" ")}
                              />
                              <Icon className="text-xs" />
                              <span>{item.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {userRole === "SUPERADMIN" ? (
              <Link
                href="/dashboard/admin"
                className={[
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-200",
                  isRouteActive("/dashboard/admin")
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100",
                ].join(" ")}
                onClick={() => setIsSidebarOpen(false)}
              >
                <FaUserShield className="text-sm" />
                <span>Super Admin</span>
              </Link>
            ) : null}
          </nav>

          <div className="border-t border-zinc-800/80 pt-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
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
