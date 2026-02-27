
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaChartLine,
  FaClock,
  FaCopy,
  FaEye,
  FaEyeSlash,
  FaLock,
  FaPlusCircle,
  FaSearch,
  FaSyncAlt,
  FaTrash,
} from "react-icons/fa";
import { useRouter } from "next/navigation";

import Button from "@/components/Button";
import { useToast } from "@/components/ToastProvider";

type ApiKeyItem = {
  id: string;
  label: string | null;
  dailyLimit: number;
  status: "ACTIVE" | "REVOKED";
  maskedKey: string;
  createdAt: string;
  lastUsedAt: string | null;
  usage7dSeries: number[];
  usage7dTotal: number;
  rotationDays: number;
};

type ApiKeysManagerProps = {
  apiKeys: ApiKeyItem[];
  canCreate: boolean;
  maxKeys: number;
  maxLimitPerKey: number;
  recommendedLimit: number;
  authProvider: "credentials" | "google";
};

type RevealResponse = {
  key?: string;
  error?: string;
};

type RotationMeta = {
  label: string;
  textClass: string;
  cardClass: string;
};

type StatusFilter = "ALL" | "ACTIVE" | "REVOKED";
type UsageFilter = "ALL" | "USED" | "UNUSED";
type SortOption = "newest" | "oldest" | "usage_desc" | "last_used_desc";

const PAGE_SIZE = 8;

function formatDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

function toTimeMs(value: string | null) {
  if (!value) {
    return 0;
  }

  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function getRotationMeta(rotationDays: number): RotationMeta {
  if (rotationDays >= 60) {
    return {
      label: "Rotate now",
      textClass: "text-red-500 dark:text-red-400",
      cardClass: "bg-red-500/10 text-red-600 dark:text-red-300",
    };
  }

  if (rotationDays >= 30) {
    return {
      label: "Rotate soon",
      textClass: "text-amber-500 dark:text-amber-300",
      cardClass: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    };
  }

  return {
    label: "Healthy",
    textClass: "text-emerald-500 dark:text-emerald-400",
    cardClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  };
}

function UsageSparkline({ values }: { values: number[] }) {
  const safeValues = values.length > 0 ? values : [0];
  const maxValue = Math.max(...safeValues, 1);
  const step = safeValues.length > 1 ? 100 / (safeValues.length - 1) : 0;

  const points = safeValues
    .map((value, index) => {
      const x = index * step;
      const y = 22 - (value / maxValue) * 18;
      return `${x},${Math.max(2, y)}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 24" className="h-7 w-24" aria-label="Usage trend 7 days">
      <line x1="0" y1="22" x2="100" y2="22" className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1" />
      <polyline
        points={points}
        fill="none"
        className="stroke-zinc-700 dark:stroke-zinc-200"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ApiKeysManager({
  apiKeys,
  canCreate,
  maxKeys,
  maxLimitPerKey,
  recommendedLimit,
  authProvider,
}: ApiKeysManagerProps) {
  const router = useRouter();
  const toast = useToast();

  const [revealedMap, setRevealedMap] = useState<Record<string, string>>({});
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyItem | null>(null);
  const [password, setPassword] = useState("");
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealError, setRevealError] = useState("");

  const [createLabel, setCreateLabel] = useState("");
  const [createLimit, setCreateLimit] = useState(String(Math.min(recommendedLimit, maxLimitPerKey)));
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);

  const totalKeys = apiKeys.length;
  const activeKeys = useMemo(() => apiKeys.filter((key) => key.status === "ACTIVE"), [apiKeys]);
  const remainingQuota = maxKeys >= 9000 ? null : Math.max(maxKeys - activeKeys.length, 0);
  const keysNeedRotation = useMemo(
    () => activeKeys.filter((key) => key.rotationDays >= 30).length,
    [activeKeys],
  );

  const selectedApiKey = apiKeys.find((item) => item.id === selectedApiKeyId) || null;

  const filteredAndSortedKeys = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    return [...apiKeys]
      .filter((item) => {
        const label = (item.label || "Default Key").toLowerCase();
        const matchesSearch = keyword.length === 0 || label.includes(keyword) || item.maskedKey.toLowerCase().includes(keyword);
        const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
        const hasUsage = item.usage7dTotal > 0;
        const matchesUsage = usageFilter === "ALL" || (usageFilter === "USED" ? hasUsage : !hasUsage);

        return matchesSearch && matchesStatus && matchesUsage;
      })
      .sort((a, b) => {
        if (sortBy === "oldest") {
          return toTimeMs(a.createdAt) - toTimeMs(b.createdAt);
        }

        if (sortBy === "usage_desc") {
          if (b.usage7dTotal !== a.usage7dTotal) {
            return b.usage7dTotal - a.usage7dTotal;
          }
          return toTimeMs(b.createdAt) - toTimeMs(a.createdAt);
        }

        if (sortBy === "last_used_desc") {
          if (toTimeMs(b.lastUsedAt) !== toTimeMs(a.lastUsedAt)) {
            return toTimeMs(b.lastUsedAt) - toTimeMs(a.lastUsedAt);
          }
          return toTimeMs(b.createdAt) - toTimeMs(a.createdAt);
        }

        return toTimeMs(b.createdAt) - toTimeMs(a.createdAt);
      });
  }, [apiKeys, searchQuery, statusFilter, usageFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedKeys.length / PAGE_SIZE));
  const pagedKeys = filteredAndSortedKeys.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, usageFilter, sortBy]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const closeDialog = () => {
    setSelectedApiKeyId(null);
    setPassword("");
    setRevealLoading(false);
    setRevealError("");
  };

  const revealApiKey = async () => {
    const requiresPassword = authProvider !== "google";

    if (!selectedApiKeyId) {
      return;
    }

    if (requiresPassword && !password) {
      const message = "Password is required.";
      setRevealError(message);
      toast.warning(message, "Validation");
      return;
    }

    setRevealLoading(true);
    setRevealError("");

    try {
      const response = await fetch("/api/api-keys/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKeyId: selectedApiKeyId, password: requiresPassword ? password : undefined }),
      });
      const data = (await response.json()) as RevealResponse;

      if (!response.ok || !data.key) {
        setRevealLoading(false);
        const message = data.error || "Failed to reveal API key.";
        setRevealError(message);
        toast.error(message, "Reveal failed");
        return;
      }

      setRevealedMap((current) => ({
        ...current,
        [selectedApiKeyId]: data.key || "",
      }));

      toast.success("API key berhasil ditampilkan.", "Reveal success");
      closeDialog();
    } catch {
      setRevealLoading(false);
      const message = "Network error while revealing API key.";
      setRevealError(message);
      toast.error(message, "Reveal failed");
    }
  };

  const toggleVisibility = (apiKeyId: string) => {
    if (revealedMap[apiKeyId]) {
      setRevealedMap((current) => {
        const next = { ...current };
        delete next[apiKeyId];
        return next;
      });
      return;
    }

    setSelectedApiKeyId(apiKeyId);
    setPassword("");
    setRevealError("");
  };

  const copyApiKey = async (apiKeyId: string) => {
    const value = revealedMap[apiKeyId];
    if (!value) {
      toast.warning("View API key dulu sebelum copy.", "Copy blocked");
      return;
    }

    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        throw new Error("Clipboard is not available.");
      }

      await navigator.clipboard.writeText(value);
      toast.success("API key copied to clipboard.", "Copied");
    } catch {
      toast.error("Failed to copy API key.", "Copy failed");
    }
  };

  const revokeKey = async (apiKeyId: string) => {
    if (revokingKeyId) {
      return false;
    }

    setRevokingKeyId(apiKeyId);
    const response = await fetch(`/api/api-keys/${apiKeyId}/revoke`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setRevokingKeyId(null);

    if (response.ok) {
      toast.success("API key berhasil di-revoke.", "API key updated");
      router.refresh();
      return true;
    }

    toast.error(data.error || "Failed to revoke API key.", "Revoke failed");
    return false;
  };

  const openRevokeDialog = (apiKey: ApiKeyItem) => {
    if (revokingKeyId) {
      return;
    }

    setRevokeTarget(apiKey);
  };

  const closeRevokeDialog = () => {
    if (revokingKeyId) {
      return;
    }

    setRevokeTarget(null);
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) {
      return;
    }

    const ok = await revokeKey(revokeTarget.id);
    if (ok) {
      setRevokeTarget(null);
    }
  };

  const createApiKey = async () => {
    setCreateError("");
    const parsedLimit = Number.parseInt(createLimit, 10);

    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      const message = "Daily limit must be a positive number.";
      setCreateError(message);
      toast.warning(message, "Validation");
      return;
    }

    setCreateLoading(true);

    try {
      const response = await fetch("/api/api-keys/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: createLabel,
          dailyLimit: parsedLimit,
        }),
      });
      const data = (await response.json()) as { error?: string };
      setCreateLoading(false);

      if (!response.ok) {
        const message = data.error || "Failed to create API key.";
        setCreateError(message);
        toast.error(message, "Create failed");
        return;
      }

      setCreateLabel("");
      setCreateLimit(String(Math.min(recommendedLimit, maxLimitPerKey)));
      toast.success("API key baru berhasil dibuat.", "API key created");
      router.refresh();
    } catch {
      setCreateLoading(false);
      const message = "Network error while creating API key.";
      setCreateError(message);
      toast.error(message, "Create failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Created API Keys</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{totalKeys}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Remaining Create Quota</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {remainingQuota === null ? "Unlimited" : remainingQuota}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Active API Keys</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{activeKeys.length}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Need Rotation</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{keysNeedRotation}</p>
        </article>
      </div>

      {canCreate ? (
        <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Create API Key</h4>
          <p className="mt-1 text-xs text-zinc-500">
            Max keys: {maxKeys >= 9000 ? "Unlimited" : maxKeys}. Max daily limit per key: {maxLimitPerKey}.
          </p>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_180px_auto] lg:items-end">
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">Label</label>
              <input
                value={createLabel}
                onChange={(event) => setCreateLabel(event.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                placeholder="e.g. Mobile App Key"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">Daily limit</label>
              <input
                value={createLimit}
                onChange={(event) => setCreateLimit(event.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                inputMode="numeric"
              />
            </div>
            <Button
              type="button"
              onClick={createApiKey}
              isLoading={createLoading}
              loadingText="Creating..."
              disabled={remainingQuota !== null && remainingQuota <= 0}
              className="h-10"
            >
              <span className="inline-flex items-center gap-2">
                <FaPlusCircle className="text-sm" />
                Create
              </span>
            </Button>
          </div>
          {createError ? <p className="mt-2 text-xs text-red-500">{createError}</p> : null}
        </section>
      ) : (
        <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Plan kamu tidak memiliki akses create API key tambahan.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5 xl:col-span-2">
            <label className="text-xs text-zinc-500">Search key</label>
            <div className="relative">
              <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Cari berdasarkan label atau key"
                className="h-10 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="ALL">All status</option>
              <option value="ACTIVE">Active</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500">Usage</label>
            <select
              value={usageFilter}
              onChange={(event) => setUsageFilter(event.target.value as UsageFilter)}
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="ALL">All usage</option>
              <option value="USED">Used in 7 days</option>
              <option value="UNUSED">Unused in 7 days</option>
            </select>
          </div>

          <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
            <label className="text-xs text-zinc-500">Sort</label>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="newest">Newest created</option>
              <option value="oldest">Oldest created</option>
              <option value="usage_desc">Highest usage 7d</option>
              <option value="last_used_desc">Recently used</option>
            </select>
          </div>
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Showing {pagedKeys.length} of {filteredAndSortedKeys.length} keys.
        </p>
      </section>

      <section className="space-y-3 lg:hidden">
        {pagedKeys.length === 0 ? (
          <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50">
            No API keys match your filter.
          </article>
        ) : (
          pagedKeys.map((apiKey) => {
            const visibleKey = revealedMap[apiKey.id] || apiKey.maskedKey;
            const isRevealed = Boolean(revealedMap[apiKey.id]);
            const rotation = getRotationMeta(apiKey.rotationDays);

            return (
              <article
                key={apiKey.id}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{apiKey.label || "Default Key"}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="truncate font-mono text-[11px] text-zinc-600 dark:text-zinc-300">{visibleKey}</p>
                      {isRevealed ? (
                        <button
                          type="button"
                          onClick={() => copyApiKey(apiKey.id)}
                          className="inline-flex size-6 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          aria-label="Copy API key"
                          title="Copy API key"
                        >
                          <FaCopy className="text-[10px]" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className={[
                      "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      apiKey.status === "ACTIVE"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-red-500/15 text-red-600 dark:text-red-400",
                    ].join(" ")}
                  >
                    {apiKey.status}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950/50">
                    <p className="text-zinc-500">Daily limit</p>
                    <p className="mt-0.5 font-semibold text-zinc-900 dark:text-zinc-100">{formatNumber(apiKey.dailyLimit)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950/50">
                    <p className="text-zinc-500">Last used</p>
                    <p className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-100">{formatDateTime(apiKey.lastUsedAt)}</p>
                  </div>
                  <div className="col-span-2 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950/50">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1 text-zinc-500">
                        <FaChartLine className="text-[10px]" />
                        Usage 7d
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatNumber(apiKey.usage7dTotal)}</span>
                    </div>
                    <div className="mt-1 flex justify-end">
                      <UsageSparkline values={apiKey.usage7dSeries} />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                  <span className={["inline-flex rounded-full px-2 py-1", rotation.cardClass].join(" ")}>
                    <FaSyncAlt className="mr-1 mt-[1px]" />
                    {rotation.label} ({apiKey.rotationDays} days)
                  </span>
                  <span className="text-zinc-500">Created {formatDateTime(apiKey.createdAt)}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleVisibility(apiKey.id)}
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-zinc-300 px-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    {isRevealed ? <FaEyeSlash className="text-xs" /> : <FaEye className="text-xs" />}
                    {isRevealed ? "Hide" : "View"}
                  </button>
                  {apiKey.status === "ACTIVE" ? (
                    <button
                      type="button"
                      onClick={() => openRevokeDialog(apiKey)}
                      disabled={revokingKeyId === apiKey.id}
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-red-300 px-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                      <FaTrash className="text-xs" />
                      {revokingKeyId === apiKey.id ? "Revoking..." : "Revoke"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </section>
      <section className="hidden overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700 lg:block">
        <table className="min-w-[1080px] w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
          <thead className="bg-zinc-100/80 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/80">
            <tr>
              <th className="px-3 py-3 text-left">Label</th>
              <th className="px-3 py-3 text-left">API Key</th>
              <th className="px-3 py-3 text-left">Daily Limit</th>
              <th className="px-3 py-3 text-left">Usage 7d</th>
              <th className="px-3 py-3 text-left">Last Used</th>
              <th className="px-3 py-3 text-left">Rotate</th>
              <th className="px-3 py-3 text-left">Status</th>
              <th className="px-3 py-3 text-left">Created</th>
              <th className="px-3 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-zinc-50/60 dark:divide-zinc-700 dark:bg-zinc-950/40">
            {pagedKeys.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-zinc-500">
                  No API keys match your filter.
                </td>
              </tr>
            ) : (
              pagedKeys.map((apiKey) => {
                const visibleKey = revealedMap[apiKey.id] || apiKey.maskedKey;
                const isRevealed = Boolean(revealedMap[apiKey.id]);
                const rotation = getRotationMeta(apiKey.rotationDays);

                return (
                  <tr key={apiKey.id}>
                    <td className="px-3 py-3 font-medium text-zinc-900 dark:text-zinc-100">{apiKey.label || "Default Key"}</td>
                    <td className="px-3 py-3 text-xs text-zinc-800 dark:text-zinc-200">
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{visibleKey}</span>
                        {isRevealed ? (
                          <button
                            type="button"
                            onClick={() => copyApiKey(apiKey.id)}
                            className="inline-flex size-6 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            aria-label="Copy API key"
                            title="Copy API key"
                          >
                            <FaCopy className="text-[10px]" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-zinc-700 dark:text-zinc-200">{formatNumber(apiKey.dailyLimit)}</td>
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{formatNumber(apiKey.usage7dTotal)}</p>
                        <UsageSparkline values={apiKey.usage7dSeries} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-600 dark:text-zinc-300">{formatDateTime(apiKey.lastUsedAt)}</td>
                    <td className="px-3 py-3 text-xs">
                      <span className={["inline-flex items-center gap-1 rounded-full px-2 py-1", rotation.cardClass].join(" ")}>
                        <FaClock className="text-[10px]" />
                        {rotation.label}
                      </span>
                      <p className={["mt-1 text-[11px]", rotation.textClass].join(" ")}>{apiKey.rotationDays} days old</p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={[
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          apiKey.status === "ACTIVE"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-red-500/15 text-red-600 dark:text-red-400",
                        ].join(" ")}
                      >
                        {apiKey.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-500">{formatDateTime(apiKey.createdAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => toggleVisibility(apiKey.id)}
                          className="inline-flex h-8 items-center gap-2 rounded-md border border-zinc-300 px-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          {isRevealed ? <FaEyeSlash className="text-xs" /> : <FaEye className="text-xs" />}
                          {isRevealed ? "Hide" : "View"}
                        </button>
                        {apiKey.status === "ACTIVE" ? (
                          <button
                            type="button"
                            onClick={() => openRevokeDialog(apiKey)}
                            disabled={revokingKeyId === apiKey.id}
                            className="inline-flex h-8 items-center gap-2 rounded-md border border-red-300 px-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                          >
                            <FaTrash className="text-xs" />
                            {revokingKeyId === apiKey.id ? "Revoking..." : "Revoke"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
        <p className="text-xs text-zinc-500">
          Page {page} of {totalPages}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(current - 1, 1))}
            disabled={page <= 1}
            className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-3 text-xs text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Prev
          </button>

          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              onClick={() => setPage(pageNumber)}
              className={[
                "inline-flex size-8 items-center justify-center rounded-md border text-xs transition-colors",
                pageNumber === page
                  ? "border-zinc-900 bg-zinc-900 text-zinc-100 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800",
              ].join(" ")}
            >
              {pageNumber}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
            disabled={page >= totalPages}
            className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-3 text-xs text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Next
          </button>
        </div>
      </section>

      {selectedApiKey ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <FaLock className="text-sm text-zinc-500" />
              <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {authProvider === "google" ? "Verify Google Session to View API Key" : "Verify Password to View API Key"}
              </h4>
            </div>

            {authProvider === "google" ? (
              <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-100/80 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
                Kamu login menggunakan Google. Lanjutkan verifikasi sesi untuk menampilkan API key.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                <label htmlFor="verify-password" className="text-sm text-zinc-700 dark:text-zinc-300">
                  Account password
                </label>
                <input
                  id="verify-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </div>
            )}

            {revealError ? <p className="mt-3 text-sm text-red-500">{revealError}</p> : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="button" onClick={revealApiKey} isLoading={revealLoading} loadingText="Verifying...">
                {authProvider === "google" ? "Verify Session & View" : "Verify & View"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {revokeTarget ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <FaTrash className="text-sm text-red-500" />
              <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Confirm Revoke API Key</h4>
            </div>

            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              API key <span className="font-medium text-zinc-900 dark:text-zinc-100">{revokeTarget.label || "Default Key"}</span>{" "}
              akan di-revoke dan tidak bisa digunakan lagi.
            </p>
            <p className="mt-2 break-all rounded-lg bg-zinc-100 px-3 py-2 font-mono text-xs text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
              {revokeTarget.maskedKey}
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeRevokeDialog} disabled={Boolean(revokingKeyId)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={confirmRevoke}
                isLoading={revokingKeyId === revokeTarget.id}
                loadingText="Revoking..."
                className="bg-red-600 text-white hover:bg-red-500 dark:bg-red-600 dark:text-white dark:hover:bg-red-500"
              >
                Confirm Revoke
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
