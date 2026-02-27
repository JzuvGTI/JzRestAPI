"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { IconType } from "react-icons";
import {
  FaBan,
  FaBolt,
  FaCheck,
  FaCheckCircle,
  FaChevronDown,
  FaClock,
  FaCode,
  FaCopy,
  FaDownload,
  FaExclamationTriangle,
  FaFilter,
  FaFlask,
  FaHeartbeat,
  FaInfoCircle,
  FaListUl,
  FaSearch,
  FaSortAmountDown,
  FaSyncAlt,
  FaTerminal,
  FaTools,
} from "react-icons/fa";

import type { ApiHealthStatus } from "@/lib/api-health-monitor";
import type { ApiCategory, ApiStatus, MarketplaceApi } from "@/lib/api-catalog";
import { useToast } from "@/components/ToastProvider";

type DocsTab = "tutorial" | "request" | "response" | "error" | "try" | "snippet" | "errorMap" | "updates";
type SnippetLang = "curl" | "javascript" | "python";
type DeprecationFilter = "ALL" | "YES" | "NO";
type HealthFilter = "ALL" | "UP" | "DEGRADED" | "DOWN";
type SortKey = "name-asc" | "name-desc" | "path-asc" | "latency-asc" | "latency-desc" | "updated-desc" | "updated-asc";

type ApiListAccordionProps = {
  apis: MarketplaceApi[];
  apiDomain: string;
  apiKeySample: string;
};

type ApiStatusResponse = {
  checkedAt?: string;
  apis: Array<{
    slug: string;
    status?: ApiStatus;
    operationalStatus?: ApiStatus;
    healthStatus?: ApiHealthStatus;
    responseTimeMs?: number | null;
    httpStatus?: number | null;
    lastCheckedAt?: string | null;
    healthError?: string | null;
  }>;
};

type ApiRuntimeState = {
  operationalStatus: ApiStatus;
  healthStatus: ApiHealthStatus;
  responseTimeMs: number | null;
  httpStatus: number | null;
  lastCheckedAt: string | null;
  healthError: string | null;
};

type ApiErrorMapItem = { code: number; reason: string; action: string };
type ApiMetaInfo = {
  version: string;
  updatedAt: string;
  changelog: string[];
  deprecated: boolean;
  deprecationNote: string | null;
  errorMap: ApiErrorMapItem[];
};
type TryApiState = {
  params: Array<{ key: string; value: string }>;
  apikey: string;
  loading: boolean;
  responseText: string;
  statusCode: number | null;
  durationMs: number | null;
  requestedAt: string | null;
};

const tabLabels: Record<DocsTab, string> = {
  tutorial: "Tutorial",
  request: "Example Request",
  response: "Response JSON",
  error: "Error Response",
  try: "Try API",
  snippet: "Code Snippet",
  errorMap: "Error Map",
  updates: "Version & Updates",
};

const statusClasses: Record<ApiStatus, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  NON_ACTIVE: "bg-red-500/15 text-red-600 dark:text-red-400",
  MAINTENANCE: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

const healthClasses: Record<ApiHealthStatus, string> = {
  UP: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  DEGRADED: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  DOWN: "bg-red-500/15 text-red-600 dark:text-red-400",
  CHECKING: "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400",
};

const categoryOrder: ApiCategory[] = ["DOWNLOADER", "DOWNLOADER_CHECKER", "CHECKER_INFO", "INFORMASI"];
const categoryMeta: Record<ApiCategory, { label: string; description: string; icon: IconType }> = {
  DOWNLOADER: { label: "Downloader", description: "Endpoint download file/media.", icon: FaDownload },
  DOWNLOADER_CHECKER: { label: "Downloader Checker", description: "Checker/search + output download.", icon: FaSearch },
  CHECKER_INFO: { label: "Checker Informasi", description: "Endpoint checker status/data/profile.", icon: FaInfoCircle },
  INFORMASI: { label: "Informasi", description: "Endpoint informasi umum.", icon: FaListUl },
};

const defaultErrorMap: ApiErrorMapItem[] = [
  { code: 400, reason: "Bad request.", action: "Periksa query parameter." },
  { code: 401, reason: "Invalid API key.", action: "Gunakan API key valid." },
  { code: 403, reason: "Blocked/inactive key.", action: "Cek status akun/API key." },
  { code: 404, reason: "Data tidak ditemukan.", action: "Ubah input/keyword." },
  { code: 429, reason: "Rate limit tercapai.", action: "Tunggu reset/upgrade." },
  { code: 500, reason: "Internal server error.", action: "Retry dan cek log." },
  { code: 502, reason: "Upstream/source gagal.", action: "Retry saat source stabil." },
  { code: 503, reason: "Maintenance/non-active.", action: "Lihat announcement/status." },
];

const apiMetaOverrides: Record<string, Partial<ApiMetaInfo>> = {
  "info-loker": { version: "v1.1.0", updatedAt: "2026-02-25", changelog: ["Added SEEK/JobStreet mapping."] },
  "info-imei": { version: "v1.1.0", updatedAt: "2026-02-25", changelog: ["Added source-backed IMEI checker."] },
  "search-telech": { version: "v1.0.0", updatedAt: "2026-02-25", changelog: ["Added Telegram channel search."] },
  "smule-dl": { version: "v1.0.0", updatedAt: "2026-02-25", changelog: ["Added Smule downloader integration."] },
};

const PAGE_SIZE_OPTIONS = [6, 12, 24] as const;
const SORT_KEY_OPTIONS: SortKey[] = ["name-asc", "name-desc", "path-asc", "latency-asc", "latency-desc", "updated-desc", "updated-asc"];
const HEALTH_FILTER_OPTIONS: HealthFilter[] = ["ALL", "UP", "DEGRADED", "DOWN"];
const DEPRECATED_FILTER_OPTIONS: DeprecationFilter[] = ["ALL", "YES", "NO"];

function parseIntWithFallback(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCategoryFilter(value: string | null): "ALL" | ApiCategory {
  if (!value) return "ALL";
  if (value === "ALL" || categoryOrder.includes(value as ApiCategory)) {
    return value as "ALL" | ApiCategory;
  }
  return "ALL";
}

function parseOperationalFilter(value: string | null): "ALL" | ApiStatus {
  if (!value) return "ALL";
  if (value === "ALL" || value === "ACTIVE" || value === "MAINTENANCE" || value === "NON_ACTIVE") {
    return value as "ALL" | ApiStatus;
  }
  return "ALL";
}

function parseHealthFilter(value: string | null): HealthFilter {
  if (!value) return "ALL";
  return HEALTH_FILTER_OPTIONS.includes(value as HealthFilter) ? (value as HealthFilter) : "ALL";
}

function parseDeprecatedFilter(value: string | null): DeprecationFilter {
  if (!value) return "ALL";
  return DEPRECATED_FILTER_OPTIONS.includes(value as DeprecationFilter) ? (value as DeprecationFilter) : "ALL";
}

function parseSortKey(value: string | null): SortKey {
  if (!value) return "name-asc";
  return SORT_KEY_OPTIONS.includes(value as SortKey) ? (value as SortKey) : "name-asc";
}

function buildDefaultRuntimeMap(apis: MarketplaceApi[]) {
  return Object.fromEntries(
    apis.map((api) => [api.slug, { operationalStatus: api.status, healthStatus: "CHECKING", responseTimeMs: null, httpStatus: null, lastCheckedAt: null, healthError: null } as ApiRuntimeState]),
  );
}

function createTryStateFromApi(api: MarketplaceApi, apiKeySample: string): TryApiState {
  const params = new URLSearchParams(api.sampleQuery);
  const list: Array<{ key: string; value: string }> = [];
  let apikey = apiKeySample;
  for (const [key, value] of params.entries()) {
    if (key.toLowerCase() === "apikey") apikey = value || apiKeySample;
    else list.push({ key, value });
  }
  return { params: list, apikey, loading: false, responseText: "", statusCode: null, durationMs: null, requestedAt: null };
}

function buildTryQueryString(state: TryApiState) {
  const params = new URLSearchParams();
  for (const item of state.params) if (item.key.trim()) params.set(item.key.trim(), item.value.trim());
  if (state.apikey.trim()) params.set("apikey", state.apikey.trim());
  return params.toString();
}

function formatPrettyJson(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw) as unknown, null, 2);
  } catch {
    return raw;
  }
}

function formatTimeAgo(iso: string | null) {
  if (!iso) return "-";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "-";
  const d = Date.now() - t;
  if (d < 1000) return "just now";
  if (d < 60000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

function formatDate(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

function buildSnippet(api: MarketplaceApi, apiDomain: string, tryState: TryApiState, lang: SnippetLang) {
  const query = buildTryQueryString(tryState);
  const url = `${apiDomain}${api.path}${query ? `?${query}` : ""}`;
  if (lang === "curl") return `curl --request GET "${url}"`;
  if (lang === "python") return `import requests\n\nurl = "${url}"\nresponse = requests.get(url, timeout=30)\nprint("status:", response.status_code)\nprint(response.json())`;
  return `const response = await fetch("${url}", { method: "GET", cache: "no-store" });\nconst data = await response.json();\nconsole.log(data);`;
}

function buildUpdatesText(meta: ApiMetaInfo) {
  const lines = [`Version: ${meta.version}`, `Updated: ${meta.updatedAt}`, `Deprecated: ${meta.deprecated ? "YES" : "NO"}`, "", "Changelog:"];
  for (const item of meta.changelog) lines.push(`- ${item}`);
  if (meta.deprecated && meta.deprecationNote) lines.push(`Deprecation note: ${meta.deprecationNote}`);
  return lines.join("\n");
}

export default function ApiListAccordion({ apis, apiDomain, apiKeySample }: ApiListAccordionProps) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [checkingSlug, setCheckingSlug] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(apis[0]?.id ?? null);
  const [tabs, setTabs] = useState<Record<string, DocsTab>>({});
  const [copiedToken, setCopiedToken] = useState("");
  const [runtimeMap, setRuntimeMap] = useState<Record<string, ApiRuntimeState>>(() => buildDefaultRuntimeMap(apis));
  const [statusLoading, setStatusLoading] = useState(false);
  const [globalCheckedAt, setGlobalCheckedAt] = useState<string | null>(null);
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | ApiCategory>(() => parseCategoryFilter(searchParams.get("category")));
  const [operationalFilter, setOperationalFilter] = useState<"ALL" | ApiStatus>(() =>
    parseOperationalFilter(searchParams.get("operational")),
  );
  const [healthFilter, setHealthFilter] = useState<HealthFilter>(() => parseHealthFilter(searchParams.get("health")));
  const [deprecatedFilter, setDeprecatedFilter] = useState<DeprecationFilter>(() =>
    parseDeprecatedFilter(searchParams.get("deprecated")),
  );
  const [sortKey, setSortKey] = useState<SortKey>(() => parseSortKey(searchParams.get("sort")));
  const [page, setPage] = useState(() => parseIntWithFallback(searchParams.get("page"), 1));
  const [pageSize, setPageSize] = useState(() => {
    const parsed = parseIntWithFallback(searchParams.get("pageSize"), 12);
    return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number]) ? parsed : 12;
  });
  const [tryStates, setTryStates] = useState<Record<string, TryApiState>>({});
  const [snippetLangMap, setSnippetLangMap] = useState<Record<string, SnippetLang>>({});

  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (search.trim()) nextParams.set("q", search.trim());
    if (categoryFilter !== "ALL") nextParams.set("category", categoryFilter);
    if (operationalFilter !== "ALL") nextParams.set("operational", operationalFilter);
    if (healthFilter !== "ALL") nextParams.set("health", healthFilter);
    if (deprecatedFilter !== "ALL") nextParams.set("deprecated", deprecatedFilter);
    if (sortKey !== "name-asc") nextParams.set("sort", sortKey);
    if (page > 1) nextParams.set("page", String(page));
    if (pageSize !== 12) nextParams.set("pageSize", String(pageSize));
    const query = nextParams.toString();
    if (query === searchParams.toString()) return;
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [router, pathname, searchParams, search, categoryFilter, operationalFilter, healthFilter, deprecatedFilter, sortKey, page, pageSize]);

  useEffect(() => {
    setRuntimeMap((current) => {
      const next = buildDefaultRuntimeMap(apis);
      for (const api of apis) if (current[api.slug]) next[api.slug] = { ...current[api.slug], operationalStatus: api.status };
      return next;
    });
  }, [apis]);

  const runStatusCheck = useCallback(
    async (force = false) => {
      setStatusLoading(true);
      try {
        const res = await fetch(`/api/apis/status${force ? "?force=1" : ""}`, { method: "GET", cache: "no-store" });
        if (!res.ok) {
          if (force) toast.error("Gagal refresh health status.", "Health check failed");
          return;
        }

        const data = (await res.json()) as ApiStatusResponse;
        const bySlug = new Map(data.apis.map((item) => [item.slug, item]));
        const next: Record<string, ApiRuntimeState> = {};

        for (const api of apis) {
          const p = bySlug.get(api.slug);
          next[api.slug] = {
            operationalStatus: p?.operationalStatus || p?.status || api.status,
            healthStatus: p?.healthStatus || "CHECKING",
            responseTimeMs: p?.responseTimeMs ?? null,
            httpStatus: p?.httpStatus ?? null,
            lastCheckedAt: p?.lastCheckedAt ?? null,
            healthError: p?.healthError ?? null,
          };
        }

        setRuntimeMap(next);
        setGlobalCheckedAt(data.checkedAt || new Date().toISOString());
        if (force) toast.success("Health status berhasil di-refresh.", "Health updated");
      } catch {
        if (force) toast.error("Gagal refresh health status.", "Health check failed");
      } finally {
        setStatusLoading(false);
      }
    },
    [apis, toast],
  );

  const runSingleStatusCheck = useCallback(
    async (api: MarketplaceApi) => {
      setCheckingSlug(api.slug);
      try {
        const res = await fetch(`/api/apis/status?slug=${encodeURIComponent(api.slug)}&force=1`, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) {
          toast.error(`Gagal re-check ${api.path}.`, "Health check failed");
          return;
        }

        const data = (await res.json()) as ApiStatusResponse;
        const first = data.apis[0];
        if (!first) {
          toast.error(`Data health ${api.path} tidak tersedia.`, "Health check failed");
          return;
        }

        setRuntimeMap((current) => ({
          ...current,
          [api.slug]: {
            operationalStatus: first.operationalStatus || first.status || api.status,
            healthStatus: first.healthStatus || "CHECKING",
            responseTimeMs: first.responseTimeMs ?? null,
            httpStatus: first.httpStatus ?? null,
            lastCheckedAt: first.lastCheckedAt ?? null,
            healthError: first.healthError ?? null,
          },
        }));
        setGlobalCheckedAt(data.checkedAt || new Date().toISOString());
        toast.success(`Health ${api.path} di-refresh.`, "Endpoint checked");
      } catch {
        toast.error(`Gagal re-check ${api.path}.`, "Health check failed");
      } finally {
        setCheckingSlug(null);
      }
    },
    [toast],
  );

  useEffect(() => {
    runStatusCheck(false);
    const id = setInterval(() => runStatusCheck(false), 30000);
    return () => clearInterval(id);
  }, [runStatusCheck]);

  const apiMetaBySlug = useMemo(() => {
    const recent = new Set(["info-loker", "info-imei", "search-telech", "smule-dl"]);
    const map: Record<string, ApiMetaInfo> = {};

    for (const api of apis) {
      const defaults: ApiMetaInfo = {
        version: "v1.0.0",
        updatedAt: recent.has(api.slug) ? "2026-02-25" : "2026-02-22",
        changelog: [`Initial release for ${api.path}.`],
        deprecated: false,
        deprecationNote: null,
        errorMap: defaultErrorMap,
      };
      const override = apiMetaOverrides[api.slug] || {};
      map[api.slug] = { ...defaults, ...override, errorMap: override.errorMap || defaults.errorMap, changelog: override.changelog || defaults.changelog };
    }

    return map;
  }, [apis]);

  const getRuntime = useCallback(
    (api: MarketplaceApi) =>
      runtimeMap[api.slug] || { operationalStatus: api.status, healthStatus: "CHECKING", responseTimeMs: null, httpStatus: null, lastCheckedAt: null, healthError: null },
    [runtimeMap],
  );

  const filteredSortedApis = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const filtered = apis.filter((api) => {
      const runtime = getRuntime(api);
      const meta = apiMetaBySlug[api.slug];

      if (keyword) {
        const text = `${api.name} ${api.slug} ${api.path} ${api.description}`.toLowerCase();
        if (!text.includes(keyword)) return false;
      }
      if (categoryFilter !== "ALL" && api.category !== categoryFilter) return false;
      if (operationalFilter !== "ALL" && runtime.operationalStatus !== operationalFilter) return false;
      if (healthFilter !== "ALL" && runtime.healthStatus !== healthFilter) return false;
      if (deprecatedFilter === "YES" && !meta.deprecated) return false;
      if (deprecatedFilter === "NO" && meta.deprecated) return false;
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const ra = getRuntime(a);
      const rb = getRuntime(b);
      const ma = apiMetaBySlug[a.slug];
      const mb = apiMetaBySlug[b.slug];

      switch (sortKey) {
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "path-asc":
          return a.path.localeCompare(b.path);
        case "latency-asc":
          return (ra.responseTimeMs ?? Number.MAX_SAFE_INTEGER) - (rb.responseTimeMs ?? Number.MAX_SAFE_INTEGER);
        case "latency-desc":
          return (rb.responseTimeMs ?? -1) - (ra.responseTimeMs ?? -1);
        case "updated-desc":
          return new Date(mb.updatedAt).getTime() - new Date(ma.updatedAt).getTime();
        case "updated-asc":
          return new Date(ma.updatedAt).getTime() - new Date(mb.updatedAt).getTime();
        case "name-asc":
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return sorted;
  }, [apis, search, categoryFilter, operationalFilter, healthFilter, deprecatedFilter, sortKey, apiMetaBySlug, getRuntime]);

  useEffect(() => {
    if (!filteredSortedApis.length) setOpenId(null);
    else if (!openId || !filteredSortedApis.some((api) => api.id === openId)) setOpenId(filteredSortedApis[0].id);
  }, [filteredSortedApis, openId]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredSortedApis.length / pageSize)), [filteredSortedApis.length, pageSize]);
  const paginatedApis = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSortedApis.slice(start, start + pageSize);
  }, [filteredSortedApis, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const items: number[] = [];
    const windowSize = 5;
    const start = Math.max(1, page - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    for (let i = start; i <= end; i += 1) items.push(i);
    return items;
  }, [page, totalPages]);

  const groupedApis = useMemo(() => {
    const grouped: Record<ApiCategory, MarketplaceApi[]> = { DOWNLOADER: [], DOWNLOADER_CHECKER: [], CHECKER_INFO: [], INFORMASI: [] };
    for (const api of paginatedApis) grouped[api.category].push(api);
    return categoryOrder.map((category) => ({ category, apis: grouped[category] })).filter((group) => group.apis.length > 0);
  }, [paginatedApis]);

  const tabsWithDefault = useMemo(() => {
    const next: Record<string, DocsTab> = {};
    for (const api of apis) next[api.id] = tabs[api.id] || "request";
    return next;
  }, [apis, tabs]);

  const summary = useMemo(() => {
    const o = { total: apis.length, active: 0, maintenance: 0, nonActive: 0 };
    const h = { up: 0, degraded: 0, down: 0 };
    for (const api of apis) {
      const r = getRuntime(api);
      if (r.operationalStatus === "ACTIVE") o.active += 1;
      else if (r.operationalStatus === "MAINTENANCE") o.maintenance += 1;
      else o.nonActive += 1;
      if (r.healthStatus === "UP") h.up += 1;
      else if (r.healthStatus === "DEGRADED") h.degraded += 1;
      else if (r.healthStatus === "DOWN") h.down += 1;
    }
    return { o, h };
  }, [apis, getRuntime]);

  const copyText = async (value: string, token: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedToken(token);
      toast.success("Text berhasil dicopy.", "Copied");
      setTimeout(() => setCopiedToken(""), 1500);
    } catch {
      setCopiedToken("");
      toast.error("Clipboard tidak bisa diakses.", "Copy failed");
    }
  };

  const updateTryParam = (api: MarketplaceApi, index: number, value: string) => {
    setTryStates((current) => {
      const existing = current[api.id] || createTryStateFromApi(api, apiKeySample);
      const params = existing.params.map((p, i) => (i === index ? { ...p, value } : p));
      return { ...current, [api.id]: { ...existing, params } };
    });
  };

  const updateTryApiKey = (api: MarketplaceApi, value: string) => {
    setTryStates((current) => {
      const existing = current[api.id] || createTryStateFromApi(api, apiKeySample);
      return { ...current, [api.id]: { ...existing, apikey: value } };
    });
  };

  const runTryRequest = async (api: MarketplaceApi) => {
    const current = tryStates[api.id] || createTryStateFromApi(api, apiKeySample);
    const qs = buildTryQueryString(current);
    const requestPath = `${api.path}${qs ? `?${qs}` : ""}`;

    setTryStates((state) => ({ ...state, [api.id]: { ...current, loading: true } }));
    const started = Date.now();
    try {
      const response = await fetch(requestPath, { method: "GET", cache: "no-store" });
      const raw = await response.text();
      const duration = Date.now() - started;

      setTryStates((state) => ({
        ...state,
        [api.id]: {
          ...(state[api.id] || current),
          loading: false,
          statusCode: response.status,
          durationMs: duration,
          requestedAt: new Date().toISOString(),
          responseText: formatPrettyJson(raw),
        },
      }));

      if (response.ok) toast.success(`Request ${api.path} berhasil.`, "Try API");
      else toast.error(`Request ${api.path} gagal (${response.status}).`, "Try API");
    } catch {
      const duration = Date.now() - started;
      setTryStates((state) => ({
        ...state,
        [api.id]: { ...(state[api.id] || current), loading: false, statusCode: null, durationMs: duration, requestedAt: new Date().toISOString(), responseText: "Failed to call endpoint." },
      }));
      toast.error(`Request ${api.path} gagal dijalankan.`, "Try API");
    }
  };

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { id: "total", title: "Total REST API", value: summary.o.total, icon: FaListUl, cls: "text-zinc-700 dark:text-zinc-200 border-zinc-200/80 bg-zinc-100/70 dark:border-zinc-700 dark:bg-zinc-900/70" },
          { id: "active", title: "Operational Active", value: summary.o.active, icon: FaCheckCircle, cls: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10" },
          { id: "maint", title: "Operational Maintenance", value: summary.o.maintenance, icon: FaTools, cls: "text-amber-500 border-amber-500/30 bg-amber-500/10" },
          { id: "non", title: "Operational Non-Active", value: summary.o.nonActive, icon: FaBan, cls: "text-red-500 border-red-500/30 bg-red-500/10" },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.id} className={`rounded-xl border p-4 transition-colors ${card.cls}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{card.title}</p>
                  <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{card.value}</p>
                </div>
                <span className="rounded-lg bg-black/5 p-2 dark:bg-white/10"><Icon className="text-base" /></span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { id: "up", title: "Health UP", value: summary.h.up, icon: FaHeartbeat, cls: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10" },
          { id: "degraded", title: "Health Degraded", value: summary.h.degraded, icon: FaExclamationTriangle, cls: "text-amber-500 border-amber-500/30 bg-amber-500/10" },
          { id: "down", title: "Health Down", value: summary.h.down, icon: FaBan, cls: "text-red-500 border-red-500/30 bg-red-500/10" },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.id} className={`rounded-xl border p-4 transition-colors ${card.cls}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{card.title}</p>
                  <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{card.value}</p>
                </div>
                <span className="rounded-lg bg-black/5 p-2 dark:bg-white/10"><Icon className="text-base" /></span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100"><FaFilter className="text-xs" />Filter & Sorting</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>Showing {filteredSortedApis.length} of {apis.length} API</span>
            <span className="rounded-full border border-zinc-300 px-2 py-0.5 dark:border-zinc-700">Last check: {formatTimeAgo(globalCheckedAt)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="xl:col-span-2">
            <span className="mb-1 block text-xs text-zinc-500">Search</span>
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name/path/description..." className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500" />
          </label>
          <label><span className="mb-1 block text-xs text-zinc-500">Category</span><select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value as "ALL" | ApiCategory); setPage(1); }} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500"><option value="ALL">All</option>{categoryOrder.map((c) => <option key={c} value={c}>{categoryMeta[c].label}</option>)}</select></label>
          <label><span className="mb-1 block text-xs text-zinc-500">Operational</span><select value={operationalFilter} onChange={(e) => { setOperationalFilter(e.target.value as "ALL" | ApiStatus); setPage(1); }} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500"><option value="ALL">All</option><option value="ACTIVE">ACTIVE</option><option value="MAINTENANCE">MAINTENANCE</option><option value="NON_ACTIVE">NON_ACTIVE</option></select></label>
          <label><span className="mb-1 block text-xs text-zinc-500">Health</span><select value={healthFilter} onChange={(e) => { setHealthFilter(e.target.value as HealthFilter); setPage(1); }} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500"><option value="ALL">All</option><option value="UP">UP</option><option value="DEGRADED">DEGRADED</option><option value="DOWN">DOWN</option></select></label>
          <label><span className="mb-1 block text-xs text-zinc-500">Deprecated</span><select value={deprecatedFilter} onChange={(e) => { setDeprecatedFilter(e.target.value as DeprecationFilter); setPage(1); }} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500"><option value="ALL">All</option><option value="NO">No</option><option value="YES">Yes</option></select></label>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <label>
            <span className="mb-1 block text-xs text-zinc-500">Sort By</span>
            <div className="relative">
              <FaSortAmountDown className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500" />
              <select value={sortKey} onChange={(e) => { setSortKey(e.target.value as SortKey); setPage(1); }} className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-8 pr-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500"><option value="name-asc">Name A-Z</option><option value="name-desc">Name Z-A</option><option value="path-asc">Path A-Z</option><option value="latency-asc">Latency Fastest</option><option value="latency-desc">Latency Slowest</option><option value="updated-desc">Updated Newest</option><option value="updated-asc">Updated Oldest</option></select>
            </div>
          </label>
          <label>
            <span className="mb-1 block text-xs text-zinc-500">Items Per Page</span>
            <select value={String(pageSize)} onChange={(e) => { const value = Number.parseInt(e.target.value, 10); setPageSize(value); setPage(1); }} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500">
              {PAGE_SIZE_OPTIONS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end justify-start md:justify-end">
            <button type="button" onClick={() => runStatusCheck(true)} disabled={statusLoading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"><FaSyncAlt className={statusLoading ? "animate-spin text-xs" : "text-xs"} />{statusLoading ? "Refreshing..." : "Refresh Health"}</button>
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-100/60 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/50">
        <span className="text-zinc-600 dark:text-zinc-300">
          Page {page} / {totalPages} | Showing {filteredSortedApis.length === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredSortedApis.length)} of {filteredSortedApis.length}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="rounded-md border border-zinc-300 px-2 py-1 text-zinc-700 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Prev
          </button>
          {pageItems.map((item) => (
            <button
              key={`page-${item}`}
              type="button"
              onClick={() => setPage(item)}
              className={`rounded-md border px-2 py-1 transition-colors ${
                item === page
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              }`}
            >
              {item}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages}
            className="rounded-md border border-zinc-300 px-2 py-1 text-zinc-700 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Next
          </button>
        </div>
      </section>

      {groupedApis.map((group) => {
        const meta = categoryMeta[group.category];
        const CategoryIcon = meta.icon;
        return (
          <section key={group.category} className="rounded-2xl border border-zinc-200 bg-zinc-100/60 p-4 sm:p-5 dark:border-zinc-700 dark:bg-zinc-900/60">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-zinc-900/10 p-2 text-zinc-700 dark:bg-zinc-100/10 dark:text-zinc-200"><CategoryIcon className="text-sm" /></span>
                  <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{meta.label}</h4>
                </div>
                <p className="mt-2 text-sm text-zinc-500">{meta.description}</p>
              </div>
              <span className="rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">{group.apis.length} API</span>
            </div>

            <div className="mt-4 space-y-3">
              {group.apis.map((api) => {
                const isOpen = openId === api.id;
                const runtime = getRuntime(api);
                const apiMeta = apiMetaBySlug[api.slug];
                const availableTabs: DocsTab[] = api.docs.tutorial ? ["tutorial", "request", "response", "error", "try", "snippet", "errorMap", "updates"] : ["request", "response", "error", "try", "snippet", "errorMap", "updates"];
                const activeTab = availableTabs.includes(tabsWithDefault[api.id]) ? tabsWithDefault[api.id] : availableTabs[0];
                const tryState = tryStates[api.id] || createTryStateFromApi(api, apiKeySample);
                const snippetLang = snippetLangMap[api.id] || "curl";
                const snippetText = buildSnippet(api, apiDomain, tryState, snippetLang);
                const exampleRequest = `${apiDomain}${api.path}?${api.sampleQuery.replace("YOUR_API_KEY", apiKeySample)}`;
                const docsContent = activeTab === "tutorial" ? api.docs.tutorial || "Tutorial belum tersedia untuk endpoint ini." : activeTab === "request" ? exampleRequest : activeTab === "response" ? JSON.stringify(api.docs.successResponse, null, 2) : activeTab === "error" ? JSON.stringify(api.docs.errorResponse, null, 2) : "";
                const updatesText = buildUpdatesText(apiMeta);
                let copyPayload = docsContent;
                if (activeTab === "snippet") copyPayload = snippetText;
                else if (activeTab === "errorMap") copyPayload = JSON.stringify(apiMeta.errorMap, null, 2);
                else if (activeTab === "updates") copyPayload = updatesText;
                else if (activeTab === "try") copyPayload = tryState.responseText || "// Run Try API first";
                const copyToken = `${api.id}-${activeTab}`;
                const copied = copiedToken === copyToken;

                return (
                  <article key={api.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50">
                    <div
                      className="flex w-full cursor-pointer items-start justify-between gap-3 px-4 py-4 text-left"
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenId((prev) => (prev === api.id ? null : api.id))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setOpenId((prev) => (prev === api.id ? null : api.id));
                        }
                      }}
                    >
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{api.path}</p>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClasses[runtime.operationalStatus]}`}>OP: {runtime.operationalStatus}</span>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${healthClasses[runtime.healthStatus]}`}>HL: {runtime.healthStatus}</span>
                          {apiMeta.deprecated ? <span className="inline-flex rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-500">Deprecated</span> : null}
                        </div>
                        <p className="text-sm text-zinc-500">{api.description}</p>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
                          <span className="inline-flex items-center gap-1"><FaBolt className="text-[10px]" />{runtime.responseTimeMs !== null ? `${runtime.responseTimeMs} ms` : "-"}</span>
                          <span className="inline-flex items-center gap-1"><FaClock className="text-[10px]" />{formatTimeAgo(runtime.lastCheckedAt)}</span>
                          <span className="inline-flex items-center gap-1"><FaCode className="text-[10px]" />{apiMeta.version}</span>
                          <span className="inline-flex items-center gap-1"><FaListUl className="text-[10px]" />Updated {formatDate(apiMeta.updatedAt)}</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              runSingleStatusCheck(api);
                            }}
                            disabled={checkingSlug === api.slug}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-700 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            <FaSyncAlt className={checkingSlug === api.slug ? "animate-spin text-[10px]" : "text-[10px]"} />
                            {checkingSlug === api.slug ? "Checking" : "Re-check"}
                          </button>
                        </div>
                      </div>
                      <FaChevronDown className={`mt-1 shrink-0 text-xs text-zinc-500 transition-transform ${isOpen ? "rotate-180" : "rotate-0"}`} />
                    </div>

                    {isOpen ? (
                      <div className="border-t border-zinc-200 px-4 pb-4 pt-3 dark:border-zinc-700">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-2">
                            {availableTabs.map((tabKey) => (
                              <button key={tabKey} type="button" onClick={() => setTabs((current) => ({ ...current, [api.id]: tabKey }))} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === tabKey ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"}`}>
                                {tabLabels[tabKey]}
                              </button>
                            ))}
                          </div>
                          <button type="button" onClick={() => copyText(copyPayload, copyToken)} className="inline-flex h-8 items-center gap-2 rounded-md border border-zinc-300 px-2 text-xs text-zinc-700 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                            {copied ? <FaCheck className="text-[10px]" /> : <FaCopy className="text-[10px]" />}{copied ? "Copied" : "Copy"}
                          </button>
                        </div>

                        {activeTab === "try" ? (
                          <div className="space-y-3">
                            <div className="rounded-lg border border-zinc-200 bg-zinc-100/70 p-3 dark:border-zinc-700 dark:bg-zinc-950/70">
                              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200"><FaFlask className="text-[10px]" />Try API Request</div>
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                {tryState.params.map((item, index) => (
                                  <label key={`${api.id}-${item.key}-${index}`} className="space-y-1">
                                    <span className="text-xs text-zinc-500">{item.key}</span>
                                    <input type="text" value={item.value} onChange={(e) => updateTryParam(api, index, e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500" />
                                  </label>
                                ))}
                              </div>
                              <label className="mt-2 block space-y-1">
                                <span className="text-xs text-zinc-500">apikey</span>
                                <input type="text" value={tryState.apikey} onChange={(e) => updateTryApiKey(api, e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500" />
                              </label>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button type="button" onClick={() => runTryRequest(api)} disabled={tryState.loading} className="inline-flex h-8 items-center gap-2 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"><FaTerminal className="text-[10px]" />{tryState.loading ? "Running..." : "Run Request"}</button>
                                <span className="text-[11px] text-zinc-500">{tryState.statusCode ? `Status ${tryState.statusCode}` : "No request yet"}{tryState.durationMs !== null ? ` | ${tryState.durationMs} ms` : ""}{tryState.requestedAt ? ` | ${formatTimeAgo(tryState.requestedAt)}` : ""}</span>
                              </div>
                            </div>
                            <pre className="max-h-80 overflow-auto rounded-lg bg-zinc-100 p-3 text-xs leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">{tryState.responseText || "// Response akan muncul di sini setelah Run Request"}</pre>
                          </div>
                        ) : null}

                        {activeTab === "snippet" ? (
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                              {(["curl", "javascript", "python"] as SnippetLang[]).map((lang) => (
                                <button key={`${api.id}-${lang}`} type="button" onClick={() => setSnippetLangMap((current) => ({ ...current, [api.id]: lang }))} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${snippetLang === lang ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"}`}>
                                  {lang}
                                </button>
                              ))}
                            </div>
                            <pre className="max-h-80 overflow-auto rounded-lg bg-zinc-100 p-3 text-xs leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">{snippetText}</pre>
                          </div>
                        ) : null}

                        {activeTab === "errorMap" ? (
                          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                            <table className="min-w-full text-left text-xs">
                              <thead className="bg-zinc-100 dark:bg-zinc-900"><tr><th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-200">Code</th><th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-200">Reason</th><th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-200">Action</th></tr></thead>
                              <tbody>{apiMeta.errorMap.map((item) => (<tr key={`${api.id}-${item.code}`} className="border-t border-zinc-200 dark:border-zinc-700"><td className="px-3 py-2 text-zinc-800 dark:text-zinc-100">{item.code}</td><td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">{item.reason}</td><td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">{item.action}</td></tr>))}</tbody>
                            </table>
                          </div>
                        ) : null}

                        {activeTab === "updates" ? (
                          <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-100/70 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950/60">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="rounded-full bg-zinc-900/10 px-2 py-1 text-zinc-700 dark:bg-zinc-100/10 dark:text-zinc-200">Version {apiMeta.version}</span>
                              <span className="rounded-full bg-zinc-900/10 px-2 py-1 text-zinc-700 dark:bg-zinc-100/10 dark:text-zinc-200">Updated {formatDate(apiMeta.updatedAt)}</span>
                              {apiMeta.deprecated ? <span className="rounded-full bg-red-500/15 px-2 py-1 text-red-500">Deprecated</span> : <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-500">Stable</span>}
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Changelog</p>
                              <ul className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300">{apiMeta.changelog.map((item, index) => <li key={`${api.id}-log-${index}`}>- {item}</li>)}</ul>
                            </div>
                          </div>
                        ) : null}

                        {activeTab === "tutorial" || activeTab === "request" || activeTab === "response" || activeTab === "error" ? (
                          <pre className="max-h-80 overflow-auto rounded-lg bg-zinc-100 p-3 text-xs leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">{docsContent}</pre>
                        ) : null}

                        {runtime.healthError ? <p className="mt-3 text-xs text-amber-500">Health note: {runtime.healthError}</p> : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
