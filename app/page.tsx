import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  FaCheckCircle,
  FaDiscord,
  FaKey,
  FaServer,
  FaShoppingCart,
  FaSignInAlt,
  FaTelegramPlane,
  FaUsers,
  FaWhatsapp,
} from "react-icons/fa";

import { PRICING_PLANS } from "@/lib/pricing-plans";
import { getLandingStats } from "@/lib/landing-stats";

const SITE_URL = "https://api.jzuv.my.id";

const PLAN_PRICE_IDR: Record<"FREE" | "PAID" | "RESELLER", number> = {
  FREE: 0,
  PAID: 5000,
  RESELLER: 15000,
};

export const revalidate = 60;

export const metadata: Metadata = {
  title: "JzREST API - High-performance API Services",
  description:
    "JzREST API menyediakan layanan API cepat, aman, dan siap produksi dengan dashboard modern, API key management, dan pricing fleksibel.",
  keywords: [
    "jzrest api",
    "rest api indonesia",
    "api marketplace",
    "api key management",
    "developer api service",
  ],
  alternates: {
    canonical: SITE_URL,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: "JzREST API - High-performance API Services",
    description:
      "Scale produk lebih cepat dengan layanan API modern, aman, dan siap produksi dari JzREST API.",
    siteName: "JzREST API",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "JzREST API",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "JzREST API - High-performance API Services",
    description:
      "Layanan API cepat dan aman untuk modern apps. Kelola endpoint, API key, dan usage dari satu dashboard.",
    images: ["/twitter-image"],
  },
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

function buildStructuredData() {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "JzREST API",
    url: SITE_URL,
    logo: `${SITE_URL}/brand/jz-logo.png`,
    sameAs: [
      "https://wa.me/6285956640569",
      "https://t.me/jzuvgti",
    ],
  };

  const offers = PRICING_PLANS.map((plan) => ({
    "@type": "Offer",
    name: `${plan.name} Plan`,
    priceCurrency: "IDR",
    price: PLAN_PRICE_IDR[plan.name].toString(),
    availability: "https://schema.org/InStock",
    url: `${SITE_URL}/#pricing`,
    description: plan.description,
    category: "API Subscription",
  }));

  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "JzREST API Subscription",
    brand: {
      "@type": "Brand",
      name: "JzREST API",
    },
    description:
      "Platform layanan REST API dengan pricing FREE, PAID, dan RESELLER untuk kebutuhan integrasi modern apps.",
    offers,
  };

  return [organization, product];
}

export default async function HomePage() {
  const stats = await getLandingStats();
  const structuredData = buildStructuredData();

  return (
    <main className="relative overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-zinc-500/20 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-zinc-300/20 blur-3xl dark:bg-zinc-700/20" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-6 md:px-6">
        <header className="animate-fade-in mb-14 rounded-2xl border border-zinc-200/80 bg-white/80 p-4 shadow-xl shadow-black/5 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-950/70 dark:shadow-black/20">
          <nav className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Image
                src="/brand/jz-logo.png"
                alt="JzREST API Logo"
                width={44}
                height={44}
                className="rounded-md border border-zinc-700/70 bg-zinc-900 object-cover"
                priority
              />
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">api.jzuv.my.id</p>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">JzREST API</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="inline-flex h-10 items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="inline-flex h-10 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Register
              </Link>
            </div>
          </nav>
        </header>

        <section className="animate-slide-up mb-12 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-zinc-100/80 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300">
              <span className="relative inline-flex">
                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-500/90" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              High-performance API services for modern apps
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-100 md:text-5xl">
              Menyediakan berbagai macam API siap pakai untuk kebutuhan automation bot dan integrasi.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
              Cocok untuk bot WhatsApp, bot Telegram, ataupun bot Discord. Tersedia dashboard yang rapi untuk
              mengelola API key, memantau usage, dan menjalankan layanan dengan lebih mudah.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#pricing"
                className="inline-flex h-11 items-center rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Lihat Pricing
              </a>
              <a
                href="#support"
                className="inline-flex h-11 items-center rounded-lg border border-zinc-300 px-5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Contact Support
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white/85 p-6 shadow-xl shadow-black/5 dark:border-zinc-800 dark:bg-zinc-900/75 dark:shadow-black/20">
            <p className="text-sm font-medium text-zinc-500">Realtime JzRestAPI Snapshot</p>
            <div className="mt-5 grid gap-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
                    <FaServer className="text-base" />
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Active API</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <FaCheckCircle className="text-xs" />
                    Active
                  </span>
                </div>
                <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatNumber(stats.activeApis)}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
                    <FaUsers className="text-base" />
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Registered Users</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <FaCheckCircle className="text-xs" />
                    Active
                  </span>
                </div>
                <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatNumber(stats.registeredUsers)}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
                    <FaKey className="text-base" />
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Active API Keys</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <FaCheckCircle className="text-xs" />
                    Active
                  </span>
                </div>
                <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatNumber(stats.activeApiKeys)}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-14">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Why choose us</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-zinc-200 bg-white/80 p-5 transition-transform duration-200 hover:-translate-y-0.5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Fast Integration</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Endpoint siap pakai untuk bot WhatsApp, Telegram, dan Discord dengan struktur request yang
                konsisten agar proses integrasi jadi lebih cepat.
              </p>
            </article>
            <article className="rounded-2xl border border-zinc-200 bg-white/80 p-5 transition-transform duration-200 hover:-translate-y-0.5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Flexible Plans</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Mulai dari FREE untuk testing, lalu upgrade ke PAID atau RESELLER kapan saja sesuai kebutuhan
                traffic dan skala bisnis.
              </p>
            </article>
            <article className="rounded-2xl border border-zinc-200 bg-white/80 p-5 transition-transform duration-200 hover:-translate-y-0.5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Production Security</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                API key dikelola secara aman, akses endpoint terkontrol, dan monitoring siap untuk kebutuhan
                penggunaan harian.
              </p>
            </article>
          </div>
        </section>

        <section id="pricing" className="mb-14 scroll-mt-16">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Pricing Plans</h2>
            <p className="text-sm text-zinc-500">Choose what fits your growth stage</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {PRICING_PLANS.map((plan) => (
              <article
                key={plan.name}
                className={[
                  "flex h-full flex-col rounded-2xl border p-5 transition-transform duration-200 hover:-translate-y-1",
                  "bg-white/85 dark:bg-zinc-900/75",
                  plan.highlight
                    ? "border-zinc-900 shadow-xl shadow-black/10 dark:border-zinc-100"
                    : "border-zinc-200 dark:border-zinc-800",
                ].join(" ")}
              >
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{plan.name}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                    {plan.price}
                  </p>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{plan.description}</p>
                  <ul className="mt-4 space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <FaCheckCircle className="mt-0.5 text-xs text-emerald-500" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {plan.name === "FREE" ? (
                  <div className="mt-5 space-y-2">
                    <Link
                      href="/register"
                      className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                    >
                      Get FREE Plan
                    </Link>
                    <Link
                      href="/login"
                      className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-zinc-300 px-4 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Already have account? Login
                    </Link>
                  </div>
                ) : (
                  <Link
                    href="/login"
                    className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  >
                    <FaSignInAlt className="text-sm" />
                    Login to Purchase
                  </Link>
                )}
              </article>
            ))}
          </div>
        </section>

        <section id="support" className="scroll-mt-16 rounded-2xl border border-zinc-200 bg-white/85 p-6 dark:border-zinc-800 dark:bg-zinc-900/75">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Contact Support</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Butuh bantuan setup, integrasi, atau upgrade plan? Hubungi kami lewat channel di bawah.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <a
              href="https://wa.me/6285956640569"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:bg-zinc-900"
            >
              <div className="inline-flex items-center gap-2">
                <FaWhatsapp className="text-lg text-emerald-500" />
                <p className="text-xs uppercase tracking-wide text-zinc-500">WhatsApp</p>
              </div>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">085956640569</p>
            </a>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <div className="inline-flex items-center gap-2">
                <FaDiscord className="text-lg text-indigo-500" />
                <p className="text-xs uppercase tracking-wide text-zinc-500">Discord</p>
              </div>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">jzuvgti</p>
            </div>

            <a
              href="https://t.me/jzuvgti"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:bg-zinc-900"
            >
              <div className="inline-flex items-center gap-2">
                <FaTelegramPlane className="text-lg text-sky-500" />
                <p className="text-xs uppercase tracking-wide text-zinc-500">Telegram</p>
              </div>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">@jzuvgti</p>
            </a>
          </div>
          <div className="mt-5">
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              <FaShoppingCart className="text-sm" />
              Start with JzREST API
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
