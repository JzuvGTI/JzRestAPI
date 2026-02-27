"use client";

import Link from "next/link";
import { useState } from "react";
import { FaCheck, FaCopy, FaKey, FaPlayCircle, FaTerminal } from "react-icons/fa";
import { useToast } from "@/components/ToastProvider";

type DashboardQuickActionsProps = {
  baseUrl: string;
  testUrl: string | null;
};

export default function DashboardQuickActions({ baseUrl, testUrl }: DashboardQuickActionsProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copyBaseUrl = async () => {
    try {
      await navigator.clipboard.writeText(baseUrl);
      setCopied(true);
      toast.success("Base URL berhasil dicopy.", "Copied");
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
      toast.error("Gagal copy Base URL.", "Copy failed");
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/70">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Quick Actions</h3>
        <p className="text-xs text-zinc-500 sm:text-sm">Aksi cepat untuk mulai testing dan integrasi.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link
          href="/dashboard/api-keys"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-zinc-100 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <FaKey className="text-xs" />
          Create API Key
        </Link>

        <Link
          href="/dashboard/apis"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-zinc-100 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <FaTerminal className="text-xs" />
          Open API Docs
        </Link>

        {testUrl ? (
          <a
            href={testUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-zinc-100 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <FaPlayCircle className="text-xs" />
            Test /api/country-time
          </a>
        ) : (
          <span className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-zinc-100 px-4 text-sm font-medium text-zinc-500 opacity-70 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-400">
            <FaPlayCircle className="text-xs" />
            Test Endpoint
          </span>
        )}

        <button
          type="button"
          onClick={copyBaseUrl}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:border-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {copied ? <FaCheck className="text-xs" /> : <FaCopy className="text-xs" />}
          {copied ? "Copied" : "Copy Base URL"}
        </button>
      </div>

      <p className="mt-3 break-all rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300">
        {baseUrl}
      </p>
    </section>
  );
}
