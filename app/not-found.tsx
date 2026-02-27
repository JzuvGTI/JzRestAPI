import Link from "next/link";
import type { ComponentType } from "react";
import { FaArrowLeft, FaHouse, FaLayerGroup, FaMagnifyingGlass } from "react-icons/fa6";

import { auth } from "@/auth";

type CtaItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const loggedInActions: CtaItem[] = [
  {
    href: "/",
    label: "Kembali ke Landing",
    icon: FaHouse,
  },
  {
    href: "/dashboard",
    label: "Masuk Dashboard",
    icon: FaArrowLeft,
  },
  {
    href: "/dashboard/apis",
    label: "Lihat REST API List",
    icon: FaLayerGroup,
  },
];

const guestAction: CtaItem = {
  href: "/login",
  label: "Login / Register",
  icon: FaArrowLeft,
};

export default async function NotFoundPage() {
  const session = await auth();
  const isLoggedIn = Boolean(session?.user?.id);
  const actions = isLoggedIn ? loggedInActions : [guestAction];

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 px-4 py-16">
      <div className="pointer-events-none absolute -left-16 top-16 h-56 w-56 rounded-full bg-zinc-700/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 bottom-8 h-64 w-64 rounded-full bg-zinc-500/10 blur-3xl" />

      <section className="mx-auto w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-2xl shadow-black/30 backdrop-blur md:p-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/70 px-3 py-1 text-xs font-medium text-zinc-300">
          <FaMagnifyingGlass className="text-[10px]" />
          Route Not Found
        </span>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-100 md:text-5xl">404 - Halaman Tidak Ditemukan</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-300 md:text-base">
          URL yang kamu akses tidak tersedia di JzREST API. Periksa kembali path yang digunakan atau lanjutkan ke halaman utama yang valid.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/70 px-4 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700/80"
              >
                <Icon className="text-sm" />
                {action.label}
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
