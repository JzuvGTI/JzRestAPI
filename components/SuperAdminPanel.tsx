"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { IconType } from "react-icons";
import {
  FaChartBar,
  FaCog,
  FaFileInvoiceDollar,
  FaHistory,
  FaKey,
  FaSearch,
  FaServer,
  FaShieldAlt,
  FaUsers,
} from "react-icons/fa";

import Button from "@/components/Button";
import { useToast } from "@/components/ToastProvider";

type TabKey = "overview" | "users" | "apiKeys" | "endpoints" | "billing" | "settings" | "audit";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type AdminOverview = {
  users: { total: number; blocked: number; superAdmins: number };
  apiKeys: { total: number; active: number; revoked: number };
  apiEndpoints: { total: number; active: number; maintenance: number; nonActive: number };
  usage: { requestsToday: number };
  billing: { totalInvoices: number; unpaidInvoices: number; paidInvoices: number; revenueThisMonth: number };
  subscriptions: { active: number; expiringSoon: number };
};

type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  role: "USER" | "SUPERADMIN";
  plan: "FREE" | "PAID" | "RESELLER";
  isBlocked: boolean;
  banUntil: string | null;
  banReason: string | null;
  referralBonusDaily: number;
  createdAt: string;
  stats: { requestsToday: number; activeApiKeys: number; totalApiKeys: number };
};

type AdminApiKey = {
  id: string;
  key: string;
  label: string | null;
  status: "ACTIVE" | "REVOKED";
  dailyLimit: number;
  createdAt: string;
  requestsToday: number;
  user: {
    id: string;
    email: string;
    name: string | null;
    plan: "FREE" | "PAID" | "RESELLER";
    role: "USER" | "SUPERADMIN";
    isBlocked: boolean;
  };
};

type AdminEndpoint = {
  id: string;
  name: string;
  path: string;
  description: string;
  status: "ACTIVE" | "NON_ACTIVE" | "MAINTENANCE";
  maintenanceNote: string | null;
  updatedAt: string;
};

type AdminInvoice = {
  id: string;
  userId: string;
  plan: "FREE" | "PAID" | "RESELLER";
  amount: number;
  currency: string;
  status: "UNPAID" | "PAID" | "EXPIRED" | "CANCELED";
  paymentMethod: string | null;
  paymentProofUrl: string | null;
  notes: string | null;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  user: { email: string; name: string | null };
};

type AdminSetting = {
  key: string;
  value: string | number | boolean;
  defaultValue: string | number | boolean;
  type: "string" | "number" | "boolean";
  updatedAt: string | null;
  updatedBy: { email: string } | null;
};

type AdminAuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  createdAt: string;
  actorUser: { email: string; name: string | null };
  ipAddress: string | null;
};

type Banner = { tone: "success" | "error"; message: string } | null;

type TabConfig = { key: TabKey; label: string; icon: IconType };

const tabs: TabConfig[] = [
  { key: "overview", label: "Overview", icon: FaChartBar },
  { key: "users", label: "Users", icon: FaUsers },
  { key: "apiKeys", label: "API Keys", icon: FaKey },
  { key: "endpoints", label: "Endpoints", icon: FaServer },
  { key: "billing", label: "Billing", icon: FaFileInvoiceDollar },
  { key: "settings", label: "Settings", icon: FaCog },
  { key: "audit", label: "Audit Log", icon: FaHistory },
];

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

function maskApiKey(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

const emptyPagination: Pagination = { page: 1, pageSize: 20, total: 0, totalPages: 1 };

export default function SuperAdminPanel() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [banner, setBanner] = useState<Banner>(null);
  const [loading, setLoading] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState<Record<TabKey, boolean>>({
    overview: false,
    users: false,
    apiKeys: false,
    endpoints: false,
    billing: false,
    settings: false,
    audit: false,
  });

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [apiKeys, setApiKeys] = useState<AdminApiKey[]>([]);
  const [endpoints, setEndpoints] = useState<AdminEndpoint[]>([]);
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);

  const [usersPagination, setUsersPagination] = useState<Pagination>(emptyPagination);
  const [apiKeysPagination, setApiKeysPagination] = useState<Pagination>(emptyPagination);
  const [invoicesPagination, setInvoicesPagination] = useState<Pagination>(emptyPagination);
  const [auditPagination, setAuditPagination] = useState<Pagination>(emptyPagination);

  const [reason, setReason] = useState("Policy update and moderation action.");

  const [userRoleDraft, setUserRoleDraft] = useState<Record<string, "USER" | "SUPERADMIN">>({});
  const [userPlanDraft, setUserPlanDraft] = useState<Record<string, "FREE" | "PAID" | "RESELLER">>({});
  const [userBonusDraft, setUserBonusDraft] = useState<Record<string, string>>({});
  const [userBanMinDraft, setUserBanMinDraft] = useState<Record<string, string>>({});
  const [userBanReasonDraft, setUserBanReasonDraft] = useState<Record<string, string>>({});

  const [apiKeyDraft, setApiKeyDraft] = useState<
    Record<string, { label: string; dailyLimit: string; status: "ACTIVE" | "REVOKED" }>
  >({});
  const [selectedApiKeyIds, setSelectedApiKeyIds] = useState<string[]>([]);

  const [endpointDraft, setEndpointDraft] = useState<
    Record<string, { status: "ACTIVE" | "NON_ACTIVE" | "MAINTENANCE"; maintenanceNote: string }>
  >({});

  const [invoiceDraft, setInvoiceDraft] = useState<
    Record<string, { status: "UNPAID" | "PAID" | "EXPIRED" | "CANCELED"; plan: "FREE" | "PAID" | "RESELLER"; amount: string; notes: string }>
  >({});

  const [settingDraft, setSettingDraft] = useState<Record<string, string>>({});

  const [userSearch, setUserSearch] = useState("");
  const [apiKeySearch, setApiKeySearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");

  const [createInvoiceForm, setCreateInvoiceForm] = useState({
    userId: "",
    plan: "PAID" as "FREE" | "PAID" | "RESELLER",
    amount: "5000",
    currency: "IDR",
    status: "UNPAID" as "UNPAID" | "PAID" | "EXPIRED" | "CANCELED",
    periodStart: "",
    periodEnd: "",
    notes: "",
  });

  const [subscriptionForm, setSubscriptionForm] = useState({
    userId: "",
    plan: "PAID" as "FREE" | "PAID" | "RESELLER",
    status: "ACTIVE" as "ACTIVE" | "EXPIRED" | "CANCELED",
    autoDowngradeTo: "FREE" as "FREE" | "PAID" | "RESELLER",
    startAt: "",
    endAt: "",
  });

  const showError = useCallback(
    (message: string) => {
      setBanner({ tone: "error", message });
      toast.error(message, "Admin action failed");
    },
    [toast],
  );

  const showSuccess = useCallback(
    (message: string) => {
      setBanner({ tone: "success", message });
      toast.success(message, "Admin action success");
    },
    [toast],
  );

  const reasonValue = useMemo(() => {
    const cleaned = reason.trim();
    return cleaned.length >= 8 ? cleaned : null;
  }, [reason]);

  const ensureReason = useCallback(() => {
    if (!reasonValue) {
      showError("Reason wajib minimal 8 karakter.");
      return null;
    }
    return reasonValue;
  }, [reasonValue, showError]);

  const loadTab = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "overview") {
        const data = await fetchJson<AdminOverview>("/api/admin/overview");
        setOverview(data);
      }
      if (activeTab === "users") {
        const data = await fetchJson<{ users: AdminUser[]; pagination: Pagination }>(`/api/admin/users?page=1&pageSize=20&q=${encodeURIComponent(userSearch)}`);
        setUsers(data.users);
        setUsersPagination(data.pagination || emptyPagination);
        setUserRoleDraft(Object.fromEntries(data.users.map((user) => [user.id, user.role])));
        setUserPlanDraft(Object.fromEntries(data.users.map((user) => [user.id, user.plan])));
        setUserBonusDraft(Object.fromEntries(data.users.map((user) => [user.id, String(user.referralBonusDaily)])));
      }
      if (activeTab === "apiKeys") {
        const data = await fetchJson<{ apiKeys: AdminApiKey[]; pagination: Pagination }>(`/api/admin/api-keys?page=1&pageSize=20&q=${encodeURIComponent(apiKeySearch)}`);
        setApiKeys(data.apiKeys);
        setApiKeysPagination(data.pagination || emptyPagination);
        setApiKeyDraft(
          Object.fromEntries(
            data.apiKeys.map((apiKey) => [
              apiKey.id,
              { label: apiKey.label || "", dailyLimit: String(apiKey.dailyLimit), status: apiKey.status },
            ]),
          ),
        );
      }
      if (activeTab === "endpoints") {
        const data = await fetchJson<{ endpoints: AdminEndpoint[] }>("/api/admin/apis");
        setEndpoints(data.endpoints);
        setEndpointDraft(
          Object.fromEntries(
            data.endpoints.map((endpoint) => [
              endpoint.id,
              { status: endpoint.status, maintenanceNote: endpoint.maintenanceNote || "" },
            ]),
          ),
        );
      }
      if (activeTab === "billing") {
        const data = await fetchJson<{ invoices: AdminInvoice[]; pagination: Pagination }>(`/api/admin/billing/invoices?page=1&pageSize=20&q=${encodeURIComponent(invoiceSearch)}`);
        setInvoices(data.invoices);
        setInvoicesPagination(data.pagination || emptyPagination);
        setInvoiceDraft(
          Object.fromEntries(
            data.invoices.map((invoice) => [
              invoice.id,
              { status: invoice.status, plan: invoice.plan, amount: String(invoice.amount), notes: invoice.notes || "" },
            ]),
          ),
        );
      }
      if (activeTab === "settings") {
        const data = await fetchJson<{ settings: AdminSetting[] }>("/api/admin/settings");
        setSettings(data.settings);
        setSettingDraft(Object.fromEntries(data.settings.map((setting) => [setting.key, String(setting.value)])));
      }
      if (activeTab === "audit") {
        const data = await fetchJson<{ logs: AdminAuditLog[]; pagination: Pagination }>(`/api/admin/audit-logs?page=1&pageSize=20&q=${encodeURIComponent(auditSearch)}`);
        setAuditLogs(data.logs);
        setAuditPagination(data.pagination || emptyPagination);
      }

      setLoadedTabs((prev) => ({ ...prev, [activeTab]: true }));
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, userSearch, apiKeySearch, invoiceSearch, auditSearch, showError]);

  useEffect(() => {
    if (!loadedTabs[activeTab]) {
      void loadTab();
    }
  }, [activeTab, loadedTabs, loadTab]);

  const refreshCurrentTab = useCallback(() => {
    setLoadedTabs((prev) => ({ ...prev, [activeTab]: false }));
    void loadTab();
  }, [activeTab, loadTab]);

  const saveUser = useCallback(
    async (user: AdminUser) => {
      const reasonText = ensureReason();
      if (!reasonText) return;

      const bonus = Number.parseInt(userBonusDraft[user.id] || "0", 10);
      if (!Number.isFinite(bonus) || bonus < 0) {
        showError("Referral bonus harus angka >= 0.");
        return;
      }

      try {
        await fetchJson(`/api/admin/users/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: userRoleDraft[user.id] || user.role,
            plan: userPlanDraft[user.id] || user.plan,
            referralBonusDaily: bonus,
            reason: reasonText,
          }),
        });
        showSuccess("User updated.");
        void loadTab();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Failed to update user.");
      }
    },
    [ensureReason, userBonusDraft, userRoleDraft, userPlanDraft, showError, showSuccess, loadTab],
  );

  const toggleBlockUser = useCallback(
    async (user: AdminUser) => {
      const reasonText = ensureReason();
      if (!reasonText) return;

      try {
        if (user.isBlocked) {
          await fetchJson(`/api/admin/users/${user.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              isBlocked: false,
              reason: reasonText,
            }),
          });
        } else {
          const banTimeMinutes = Number.parseInt(userBanMinDraft[user.id] || "60", 10);
          if (!Number.isFinite(banTimeMinutes) || (banTimeMinutes <= 0 && banTimeMinutes !== -1)) {
            showError("Ban time harus angka positif atau -1.");
            return;
          }

          await fetchJson(`/api/admin/users/${user.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              isBlocked: true,
              banTimeMinutes,
              banReason: userBanReasonDraft[user.id] || "",
              reason: reasonText,
            }),
          });
        }

        showSuccess("User status updated.");
        void loadTab();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Failed to update block status.");
      }
    },
    [ensureReason, userBanMinDraft, userBanReasonDraft, showError, showSuccess, loadTab],
  );

  const createApiKeyForUser = useCallback(
    async (user: AdminUser) => {
      const reasonText = ensureReason();
      if (!reasonText) return;

      const label = window.prompt(`Label API key baru untuk ${user.email}`, "Admin Key") ?? "";
      const limitText = window.prompt("Daily limit API key baru", "500") ?? "500";
      const dailyLimit = Number.parseInt(limitText, 10);
      if (!Number.isFinite(dailyLimit) || dailyLimit <= 0) {
        showError("Daily limit harus angka positif.");
        return;
      }

      try {
        await fetchJson(`/api/admin/users/${user.id}/api-keys/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label,
            dailyLimit,
            reason: reasonText,
          }),
        });

        showSuccess("API key berhasil dibuat untuk user.");
        void loadTab();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Failed to create API key.");
      }
    },
    [ensureReason, showError, showSuccess, loadTab],
  );

  const saveApiKey = useCallback(
    async (apiKey: AdminApiKey) => {
      const reasonText = ensureReason();
      if (!reasonText) return;

      const draft = apiKeyDraft[apiKey.id];
      const dailyLimit = Number.parseInt(draft?.dailyLimit || String(apiKey.dailyLimit), 10);
      if (!Number.isFinite(dailyLimit) || dailyLimit <= 0) {
        showError("Daily limit harus angka positif.");
        return;
      }

      try {
        await fetchJson(`/api/admin/api-keys/${apiKey.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: draft?.label || "",
            dailyLimit,
            status: draft?.status || apiKey.status,
            reason: reasonText,
          }),
        });

        showSuccess("API key updated.");
        void loadTab();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Failed to update API key.");
      }
    },
    [ensureReason, apiKeyDraft, showError, showSuccess, loadTab],
  );

  const bulkRevokeApiKeys = useCallback(async () => {
    const reasonText = ensureReason();
    if (!reasonText) return;
    if (selectedApiKeyIds.length === 0) {
      showError("Pilih API key untuk bulk revoke.");
      return;
    }

    try {
      await fetchJson("/api/admin/api-keys/bulk-revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKeyIds: selectedApiKeyIds,
          reason: reasonText,
        }),
      });

      showSuccess("Bulk revoke completed.");
      setSelectedApiKeyIds([]);
      void loadTab();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Bulk revoke failed.");
    }
  }, [ensureReason, selectedApiKeyIds, showError, showSuccess, loadTab]);

  const saveEndpoint = useCallback(
    async (endpoint: AdminEndpoint) => {
      const reasonText = ensureReason();
      if (!reasonText) return;

      const draft = endpointDraft[endpoint.id] || {
        status: endpoint.status,
        maintenanceNote: endpoint.maintenanceNote || "",
      };

      try {
        await fetchJson(`/api/admin/apis/${endpoint.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: draft.status,
            maintenanceNote: draft.maintenanceNote,
            reason: reasonText,
          }),
        });

        showSuccess("Endpoint updated.");
        void loadTab();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Failed to update endpoint.");
      }
    },
    [ensureReason, endpointDraft, showError, showSuccess, loadTab],
  );

  const createInvoice = useCallback(async () => {
    const reasonText = ensureReason();
    if (!reasonText) return;

    const amount = Number.parseInt(createInvoiceForm.amount || "0", 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      showError("Amount invoice harus angka positif.");
      return;
    }

    if (!createInvoiceForm.userId || !createInvoiceForm.periodStart || !createInvoiceForm.periodEnd) {
      showError("User ID dan period start/end wajib diisi.");
      return;
    }

    try {
      await fetchJson("/api/admin/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: createInvoiceForm.userId,
          plan: createInvoiceForm.plan,
          amount,
          currency: createInvoiceForm.currency,
          status: createInvoiceForm.status,
          periodStart: new Date(createInvoiceForm.periodStart).toISOString(),
          periodEnd: new Date(createInvoiceForm.periodEnd).toISOString(),
          notes: createInvoiceForm.notes,
          reason: reasonText,
        }),
      });

      showSuccess("Invoice created.");
      setCreateInvoiceForm((current) => ({
        ...current,
        userId: "",
        periodStart: "",
        periodEnd: "",
        notes: "",
      }));
      void loadTab();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to create invoice.");
    }
  }, [ensureReason, createInvoiceForm, showError, showSuccess, loadTab]);

  const saveInvoice = useCallback(
    async (invoice: AdminInvoice) => {
      const reasonText = ensureReason();
      if (!reasonText) return;

      const draft = invoiceDraft[invoice.id];
      const amount = Number.parseInt(draft?.amount || String(invoice.amount), 10);
      if (!Number.isFinite(amount) || amount <= 0) {
        showError("Amount invoice harus angka positif.");
        return;
      }

      try {
        await fetchJson(`/api/admin/billing/invoices/${invoice.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: draft?.status || invoice.status,
            plan: draft?.plan || invoice.plan,
            amount,
            notes: draft?.notes || null,
            reason: reasonText,
          }),
        });

        showSuccess("Invoice updated.");
        void loadTab();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Failed to update invoice.");
      }
    },
    [ensureReason, invoiceDraft, showError, showSuccess, loadTab],
  );

  const saveSubscription = useCallback(async () => {
    const reasonText = ensureReason();
    if (!reasonText) return;
    if (!subscriptionForm.userId || !subscriptionForm.startAt) {
      showError("User ID dan startAt wajib diisi.");
      return;
    }

    try {
      await fetchJson(`/api/admin/subscriptions/${subscriptionForm.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: subscriptionForm.plan,
          status: subscriptionForm.status,
          autoDowngradeTo: subscriptionForm.autoDowngradeTo,
          startAt: new Date(subscriptionForm.startAt).toISOString(),
          endAt: subscriptionForm.endAt ? new Date(subscriptionForm.endAt).toISOString() : null,
          reason: reasonText,
        }),
      });

      showSuccess("Subscription updated.");
      void loadTab();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to update subscription.");
    }
  }, [ensureReason, subscriptionForm, showError, showSuccess, loadTab]);

  const saveSetting = useCallback(
    async (setting: AdminSetting) => {
      const reasonText = ensureReason();
      if (!reasonText) return;

      let value: string | number | boolean = settingDraft[setting.key] ?? String(setting.value);
      if (setting.type === "number") {
        const parsed = Number.parseInt(String(value), 10);
        if (!Number.isFinite(parsed)) {
          showError(`Setting ${setting.key} harus angka.`);
          return;
        }
        value = parsed;
      } else if (setting.type === "boolean") {
        value = String(value).toLowerCase() === "true";
      } else {
        value = String(value);
      }

      try {
        await fetchJson(`/api/admin/settings/${setting.key}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            value,
            reason: reasonText,
          }),
        });

        showSuccess("Setting updated.");
        void loadTab();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Failed to update setting.");
      }
    },
    [ensureReason, settingDraft, showError, showSuccess, loadTab],
  );

  return (
    <section className="space-y-4">
      <nav className="flex gap-2 overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-100/60 p-2 dark:border-zinc-700 dark:bg-zinc-900/60">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800",
              ].join(" ")}
            >
              <Icon className="text-xs" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {banner ? (
        <div
          className={[
            "rounded-lg px-3 py-2 text-sm",
            banner.tone === "error"
              ? "border border-red-500/40 bg-red-500/10 text-red-300"
              : "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
          ].join(" ")}
        >
          {banner.message}
        </div>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Action reason (required)</label>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="secondary" className="h-10" onClick={refreshCurrentTab} isLoading={loading}>
              Refresh
            </Button>
          </div>
        </div>
      </section>

      {activeTab === "overview" ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Users</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{overview ? formatNumber(overview.users.total) : "-"}</p>
          </article>
          <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
            <p className="text-xs uppercase tracking-wide text-zinc-500">API Keys</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{overview ? formatNumber(overview.apiKeys.total) : "-"}</p>
          </article>
          <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
            <p className="text-xs uppercase tracking-wide text-zinc-500">REST APIs</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{overview ? formatNumber(overview.apiEndpoints.total) : "-"}</p>
          </article>
          <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Requests Today</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{overview ? formatNumber(overview.usage.requestsToday) : "-"}</p>
          </article>
        </section>
      ) : null}

      {activeTab === "users" ? (
        <section className="space-y-3">
          <div className="flex gap-2">
            <input
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              className="h-10 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="Search user by email/name"
            />
            <Button
              type="button"
              className="h-10"
              onClick={() => {
                setLoadedTabs((prev) => ({ ...prev, users: false }));
                void loadTab();
              }}
            >
              <span className="inline-flex items-center gap-2">
                <FaSearch className="text-xs" />
                Search
              </span>
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="min-w-[1160px] w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
              <thead className="bg-zinc-100/80 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/70">
                <tr>
                  <th className="px-3 py-3 text-left">User</th>
                  <th className="px-3 py-3 text-left">Role</th>
                  <th className="px-3 py-3 text-left">Plan</th>
                  <th className="px-3 py-3 text-left">Referral Bonus</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Stats</th>
                  <th className="px-3 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-zinc-50/60 dark:divide-zinc-700 dark:bg-zinc-950/40">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-3 py-3 align-top">
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">{user.name || "No Name"}</p>
                      <p className="text-xs text-zinc-500">{user.email}</p>
                      <p className="text-xs text-zinc-500">Joined: {formatDateTime(user.createdAt)}</p>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <select
                        value={userRoleDraft[user.id] || user.role}
                        onChange={(event) =>
                          setUserRoleDraft((current) => ({ ...current, [user.id]: event.target.value as "USER" | "SUPERADMIN" }))
                        }
                        className="h-9 w-36 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      >
                        <option value="USER">USER</option>
                        <option value="SUPERADMIN">SUPERADMIN</option>
                      </select>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <select
                        value={userPlanDraft[user.id] || user.plan}
                        onChange={(event) =>
                          setUserPlanDraft((current) => ({ ...current, [user.id]: event.target.value as "FREE" | "PAID" | "RESELLER" }))
                        }
                        className="h-9 w-36 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      >
                        <option value="FREE">FREE</option>
                        <option value="PAID">PAID</option>
                        <option value="RESELLER">RESELLER</option>
                      </select>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <input
                        value={userBonusDraft[user.id] || "0"}
                        onChange={(event) => setUserBonusDraft((current) => ({ ...current, [user.id]: event.target.value }))}
                        className="h-9 w-24 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        inputMode="numeric"
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className={["inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", user.isBlocked ? "bg-red-500/15 text-red-500" : "bg-emerald-500/15 text-emerald-500"].join(" ")}>
                        {user.isBlocked ? "BLOCKED" : "ACTIVE"}
                      </span>
                      <input
                        value={userBanMinDraft[user.id] || "60"}
                        onChange={(event) => setUserBanMinDraft((current) => ({ ...current, [user.id]: event.target.value }))}
                        className="mt-1 h-8 w-24 rounded-md border border-zinc-300 bg-white px-2 text-[11px] text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        placeholder="Ban min"
                      />
                      <input
                        value={userBanReasonDraft[user.id] || ""}
                        onChange={(event) => setUserBanReasonDraft((current) => ({ ...current, [user.id]: event.target.value }))}
                        className="mt-1 h-8 w-44 rounded-md border border-zinc-300 bg-white px-2 text-[11px] text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        placeholder="Ban reason"
                      />
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-zinc-500">
                      <p>Requests: {formatNumber(user.stats.requestsToday)}</p>
                      <p>Active keys: {formatNumber(user.stats.activeApiKeys)}</p>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex gap-2">
                        <Button type="button" className="h-8 px-2 text-xs" onClick={() => void saveUser(user)}>
                          Save
                        </Button>
                        <button
                          type="button"
                          onClick={() => void createApiKeyForUser(user)}
                          className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-2 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Create Key
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleBlockUser(user)}
                          className={["inline-flex h-8 items-center rounded-md px-2 text-xs font-medium", user.isBlocked ? "border border-emerald-500/40 text-emerald-500" : "border border-red-500/40 text-red-500"].join(" ")}
                        >
                          {user.isBlocked ? "Unblock" : "Block"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500">Total users loaded: {usersPagination.total}</p>
        </section>
      ) : null}

      {activeTab === "apiKeys" ? (
        <section className="space-y-3">
          <div className="flex gap-2">
            <input
              value={apiKeySearch}
              onChange={(event) => setApiKeySearch(event.target.value)}
              className="h-10 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="Search API key"
            />
            <Button
              type="button"
              className="h-10"
              onClick={() => {
                setLoadedTabs((prev) => ({ ...prev, apiKeys: false }));
                void loadTab();
              }}
            >
              Search
            </Button>
            <Button type="button" variant="secondary" className="h-10" onClick={() => void bulkRevokeApiKeys()}>
              Bulk Revoke ({selectedApiKeyIds.length})
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="min-w-[1260px] w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
              <thead className="bg-zinc-100/80 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/70">
                <tr>
                  <th className="px-3 py-3 text-left">Select</th>
                  <th className="px-3 py-3 text-left">User</th>
                  <th className="px-3 py-3 text-left">Key</th>
                  <th className="px-3 py-3 text-left">Label</th>
                  <th className="px-3 py-3 text-left">Limit</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-zinc-50/60 dark:divide-zinc-700 dark:bg-zinc-950/40">
                {apiKeys.map((apiKey) => {
                  const draft = apiKeyDraft[apiKey.id];
                  const selected = selectedApiKeyIds.includes(apiKey.id);
                  return (
                    <tr key={apiKey.id}>
                      <td className="px-3 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) =>
                            setSelectedApiKeyIds((current) =>
                              event.target.checked ? [...current, apiKey.id] : current.filter((id) => id !== apiKey.id),
                            )
                          }
                          className="mt-1 size-4 rounded border-zinc-400 bg-zinc-950"
                        />
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-zinc-500">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{apiKey.user.name || "No Name"}</p>
                        <p>{apiKey.user.email}</p>
                      </td>
                      <td className="px-3 py-3 align-top font-mono text-xs text-zinc-700 dark:text-zinc-200">{maskApiKey(apiKey.key)}</td>
                      <td className="px-3 py-3 align-top">
                        <input
                          value={draft?.label || ""}
                          onChange={(event) =>
                            setApiKeyDraft((current) => ({
                              ...current,
                              [apiKey.id]: {
                                ...(current[apiKey.id] || {
                                  label: "",
                                  dailyLimit: String(apiKey.dailyLimit),
                                  status: apiKey.status,
                                }),
                                label: event.target.value,
                              },
                            }))
                          }
                          className="h-9 w-40 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          value={draft?.dailyLimit || String(apiKey.dailyLimit)}
                          onChange={(event) =>
                            setApiKeyDraft((current) => ({
                              ...current,
                              [apiKey.id]: {
                                ...(current[apiKey.id] || {
                                  label: "",
                                  dailyLimit: String(apiKey.dailyLimit),
                                  status: apiKey.status,
                                }),
                                dailyLimit: event.target.value,
                              },
                            }))
                          }
                          className="h-9 w-24 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          inputMode="numeric"
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <select
                          value={draft?.status || apiKey.status}
                          onChange={(event) =>
                            setApiKeyDraft((current) => ({
                              ...current,
                              [apiKey.id]: {
                                ...(current[apiKey.id] || {
                                  label: "",
                                  dailyLimit: String(apiKey.dailyLimit),
                                  status: apiKey.status,
                                }),
                                status: event.target.value as "ACTIVE" | "REVOKED",
                              },
                            }))
                          }
                          className="h-9 w-28 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="REVOKED">REVOKED</option>
                        </select>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Button type="button" className="h-8 px-2 text-xs" onClick={() => void saveApiKey(apiKey)}>
                          Save
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500">Total API keys loaded: {apiKeysPagination.total}</p>
        </section>
      ) : null}

      {activeTab === "endpoints" ? (
        <section className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Total</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{formatNumber(endpoints.length)}</p>
            </article>
            <article className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-500">Active</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-400">{formatNumber(endpoints.filter((x) => x.status === "ACTIVE").length)}</p>
            </article>
            <article className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-xs uppercase tracking-wide text-amber-500">Maintenance</p>
              <p className="mt-1 text-2xl font-semibold text-amber-400">{formatNumber(endpoints.filter((x) => x.status === "MAINTENANCE").length)}</p>
            </article>
            <article className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-xs uppercase tracking-wide text-red-500">Non Active</p>
              <p className="mt-1 text-2xl font-semibold text-red-400">{formatNumber(endpoints.filter((x) => x.status === "NON_ACTIVE").length)}</p>
            </article>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="min-w-[1040px] w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
              <thead className="bg-zinc-100/80 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/70">
                <tr>
                  <th className="px-3 py-3 text-left">API</th>
                  <th className="px-3 py-3 text-left">Path</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Maintenance Note</th>
                  <th className="px-3 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-zinc-50/60 dark:divide-zinc-700 dark:bg-zinc-950/40">
                {endpoints.map((endpoint) => {
                  const draft = endpointDraft[endpoint.id] || { status: endpoint.status, maintenanceNote: endpoint.maintenanceNote || "" };
                  return (
                    <tr key={endpoint.id}>
                      <td className="px-3 py-3 align-top">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{endpoint.name}</p>
                        <p className="text-xs text-zinc-500">{endpoint.description}</p>
                      </td>
                      <td className="px-3 py-3 align-top font-mono text-xs text-zinc-700 dark:text-zinc-200">{endpoint.path}</td>
                      <td className="px-3 py-3 align-top">
                        <select
                          value={draft.status}
                          onChange={(event) =>
                            setEndpointDraft((current) => ({
                              ...current,
                              [endpoint.id]: { ...draft, status: event.target.value as "ACTIVE" | "NON_ACTIVE" | "MAINTENANCE" },
                            }))
                          }
                          className="h-9 w-40 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="NON_ACTIVE">NON_ACTIVE</option>
                          <option value="MAINTENANCE">MAINTENANCE</option>
                        </select>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          value={draft.maintenanceNote}
                          onChange={(event) =>
                            setEndpointDraft((current) => ({
                              ...current,
                              [endpoint.id]: { ...draft, maintenanceNote: event.target.value },
                            }))
                          }
                          className="h-9 w-64 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          placeholder="Maintenance note"
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Button type="button" className="h-8 px-2 text-xs" onClick={() => void saveEndpoint(endpoint)}>
                          Save
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "billing" ? (
        <section className="space-y-3">
          <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Create Invoice</h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input value={createInvoiceForm.userId} onChange={(event) => setCreateInvoiceForm((current) => ({ ...current, userId: event.target.value }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="User ID" />
              <select value={createInvoiceForm.plan} onChange={(event) => setCreateInvoiceForm((current) => ({ ...current, plan: event.target.value as "FREE" | "PAID" | "RESELLER" }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"><option value="FREE">FREE</option><option value="PAID">PAID</option><option value="RESELLER">RESELLER</option></select>
              <input value={createInvoiceForm.amount} onChange={(event) => setCreateInvoiceForm((current) => ({ ...current, amount: event.target.value }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" inputMode="numeric" placeholder="Amount" />
              <select value={createInvoiceForm.status} onChange={(event) => setCreateInvoiceForm((current) => ({ ...current, status: event.target.value as "UNPAID" | "PAID" | "EXPIRED" | "CANCELED" }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"><option value="UNPAID">UNPAID</option><option value="PAID">PAID</option><option value="EXPIRED">EXPIRED</option><option value="CANCELED">CANCELED</option></select>
              <input type="datetime-local" value={createInvoiceForm.periodStart} onChange={(event) => setCreateInvoiceForm((current) => ({ ...current, periodStart: event.target.value }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
              <input type="datetime-local" value={createInvoiceForm.periodEnd} onChange={(event) => setCreateInvoiceForm((current) => ({ ...current, periodEnd: event.target.value }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
              <input value={createInvoiceForm.notes} onChange={(event) => setCreateInvoiceForm((current) => ({ ...current, notes: event.target.value }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="Notes" />
              <Button type="button" className="h-10" onClick={() => void createInvoice()}>Create</Button>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Manual Subscription Update</h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input value={subscriptionForm.userId} onChange={(event) => setSubscriptionForm((current) => ({ ...current, userId: event.target.value }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="User ID" />
              <select value={subscriptionForm.plan} onChange={(event) => setSubscriptionForm((current) => ({ ...current, plan: event.target.value as "FREE" | "PAID" | "RESELLER" }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"><option value="FREE">FREE</option><option value="PAID">PAID</option><option value="RESELLER">RESELLER</option></select>
              <select value={subscriptionForm.status} onChange={(event) => setSubscriptionForm((current) => ({ ...current, status: event.target.value as "ACTIVE" | "EXPIRED" | "CANCELED" }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"><option value="ACTIVE">ACTIVE</option><option value="EXPIRED">EXPIRED</option><option value="CANCELED">CANCELED</option></select>
              <select value={subscriptionForm.autoDowngradeTo} onChange={(event) => setSubscriptionForm((current) => ({ ...current, autoDowngradeTo: event.target.value as "FREE" | "PAID" | "RESELLER" }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"><option value="FREE">Downgrade FREE</option><option value="PAID">Downgrade PAID</option><option value="RESELLER">Downgrade RESELLER</option></select>
              <input type="datetime-local" value={subscriptionForm.startAt} onChange={(event) => setSubscriptionForm((current) => ({ ...current, startAt: event.target.value }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
              <input type="datetime-local" value={subscriptionForm.endAt} onChange={(event) => setSubscriptionForm((current) => ({ ...current, endAt: event.target.value }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
              <Button type="button" className="h-10" onClick={() => void saveSubscription()}>Update Subscription</Button>
            </div>
          </section>

          <div className="flex gap-2">
            <input value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} className="h-10 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="Search invoice" />
            <Button type="button" className="h-10" onClick={() => { setLoadedTabs((prev) => ({ ...prev, billing: false })); void loadTab(); }}>Search</Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="min-w-[1320px] w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
              <thead className="bg-zinc-100/80 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/70">
                <tr>
                  <th className="px-3 py-3 text-left">Invoice</th>
                  <th className="px-3 py-3 text-left">User</th>
                  <th className="px-3 py-3 text-left">Plan / Amount</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Proof / Method</th>
                  <th className="px-3 py-3 text-left">Notes</th>
                  <th className="px-3 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-zinc-50/60 dark:divide-zinc-700 dark:bg-zinc-950/40">
                {invoices.map((invoice) => {
                  const draft = invoiceDraft[invoice.id];
                  return (
                    <tr key={invoice.id}>
                      <td className="px-3 py-3 align-top text-xs text-zinc-500">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{invoice.id}</p>
                        <p>{formatDateTime(invoice.createdAt)}</p>
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-zinc-500">{invoice.user.email}</td>
                      <td className="px-3 py-3 align-top">
                        <select value={draft?.plan || invoice.plan} onChange={(event) => setInvoiceDraft((current) => ({ ...current, [invoice.id]: { ...(current[invoice.id] || { status: invoice.status, plan: invoice.plan, amount: String(invoice.amount), notes: invoice.notes || "" }), plan: event.target.value as "FREE" | "PAID" | "RESELLER" } }))} className="h-9 w-32 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"><option value="FREE">FREE</option><option value="PAID">PAID</option><option value="RESELLER">RESELLER</option></select>
                        <input value={draft?.amount || String(invoice.amount)} onChange={(event) => setInvoiceDraft((current) => ({ ...current, [invoice.id]: { ...(current[invoice.id] || { status: invoice.status, plan: invoice.plan, amount: String(invoice.amount), notes: invoice.notes || "" }), amount: event.target.value } }))} className="mt-1 h-9 w-24 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" inputMode="numeric" />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <select value={draft?.status || invoice.status} onChange={(event) => setInvoiceDraft((current) => ({ ...current, [invoice.id]: { ...(current[invoice.id] || { status: invoice.status, plan: invoice.plan, amount: String(invoice.amount), notes: invoice.notes || "" }), status: event.target.value as "UNPAID" | "PAID" | "EXPIRED" | "CANCELED" } }))} className="h-9 w-32 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"><option value="UNPAID">UNPAID</option><option value="PAID">PAID</option><option value="EXPIRED">EXPIRED</option><option value="CANCELED">CANCELED</option></select>
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-zinc-500">
                        <p>{invoice.paymentMethod || "-"}</p>
                        {invoice.paymentProofUrl ? (
                          <a
                            href={invoice.paymentProofUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex text-[11px] text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-zinc-100"
                          >
                            View proof
                          </a>
                        ) : (
                          <p className="mt-1 text-[11px] text-zinc-500">No proof uploaded</p>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input value={draft?.notes || ""} onChange={(event) => setInvoiceDraft((current) => ({ ...current, [invoice.id]: { ...(current[invoice.id] || { status: invoice.status, plan: invoice.plan, amount: String(invoice.amount), notes: invoice.notes || "" }), notes: event.target.value } }))} className="h-9 w-56 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
                      </td>
                      <td className="px-3 py-3 align-top"><Button type="button" className="h-8 px-2 text-xs" onClick={() => void saveInvoice(invoice)}>Save</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500">Total invoices loaded: {invoicesPagination.total}</p>
        </section>
      ) : null}

      {activeTab === "settings" ? (
        <section className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="min-w-[920px] w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
              <thead className="bg-zinc-100/80 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/70">
                <tr>
                  <th className="px-3 py-3 text-left">Setting</th>
                  <th className="px-3 py-3 text-left">Value</th>
                  <th className="px-3 py-3 text-left">Default</th>
                  <th className="px-3 py-3 text-left">Type</th>
                  <th className="px-3 py-3 text-left">Updated</th>
                  <th className="px-3 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-zinc-50/60 dark:divide-zinc-700 dark:bg-zinc-950/40">
                {settings.map((setting) => (
                  <tr key={setting.key}>
                    <td className="px-3 py-3 align-top text-xs text-zinc-500">{setting.key}</td>
                    <td className="px-3 py-3 align-top">
                      {setting.type === "boolean" ? (
                        <select value={settingDraft[setting.key] || String(setting.value)} onChange={(event) => setSettingDraft((current) => ({ ...current, [setting.key]: event.target.value }))} className="h-9 w-28 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"><option value="true">true</option><option value="false">false</option></select>
                      ) : (
                        <input value={settingDraft[setting.key] || String(setting.value)} onChange={(event) => setSettingDraft((current) => ({ ...current, [setting.key]: event.target.value }))} className="h-9 w-56 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
                      )}
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-zinc-500">{String(setting.defaultValue)}</td>
                    <td className="px-3 py-3 align-top text-xs text-zinc-500">{setting.type}</td>
                    <td className="px-3 py-3 align-top text-xs text-zinc-500">{formatDateTime(setting.updatedAt)}</td>
                    <td className="px-3 py-3 align-top"><Button type="button" className="h-8 px-2 text-xs" onClick={() => void saveSetting(setting)}>Save</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "audit" ? (
        <section className="space-y-3">
          <div className="flex gap-2">
            <input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} className="h-10 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="Search audit log" />
            <Button type="button" className="h-10" onClick={() => { setLoadedTabs((prev) => ({ ...prev, audit: false })); void loadTab(); }}>Search</Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="min-w-[980px] w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
              <thead className="bg-zinc-100/80 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/70">
                <tr>
                  <th className="px-3 py-3 text-left">Time</th>
                  <th className="px-3 py-3 text-left">Actor</th>
                  <th className="px-3 py-3 text-left">Action</th>
                  <th className="px-3 py-3 text-left">Target</th>
                  <th className="px-3 py-3 text-left">Reason</th>
                  <th className="px-3 py-3 text-left">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-zinc-50/60 dark:divide-zinc-700 dark:bg-zinc-950/40">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-3 py-3 align-top text-xs text-zinc-500">{formatDateTime(log.createdAt)}</td>
                    <td className="px-3 py-3 align-top text-xs text-zinc-500">{log.actorUser.email}</td>
                    <td className="px-3 py-3 align-top text-xs text-zinc-500">{log.action}</td>
                    <td className="px-3 py-3 align-top text-xs text-zinc-500">{log.targetType} / {log.targetId}</td>
                    <td className="px-3 py-3 align-top text-xs text-zinc-500">{log.reason}</td>
                    <td className="px-3 py-3 align-top text-xs text-zinc-500">{log.ipAddress || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500">Total logs loaded: {auditPagination.total}</p>
        </section>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/60">
        <p className="inline-flex items-center gap-2">
          <FaShieldAlt className="text-[11px]" />
          Semua aksi sensitif wajib reason dan tercatat di audit log.
        </p>
      </section>
    </section>
  );
}
