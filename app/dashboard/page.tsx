import Link from "next/link";
import {
  FaBell,
  FaCheckCircle,
  FaExclamationTriangle,
  FaKey,
  FaRocket,
  FaSignal,
} from "react-icons/fa";

import { auth } from "@/auth";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardQuickActions from "@/components/DashboardQuickActions";
import { getMarketplaceApis } from "@/lib/api-endpoints";
import { getEffectiveDailyLimit, getOrProvisionDashboardUser, getUtcDateOnly } from "@/lib/dashboard-user";
import { PRICING_PLANS } from "@/lib/pricing-plans";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

const planOrder: Record<"FREE" | "PAID" | "RESELLER", number> = {
  FREE: 0,
  PAID: 1,
  RESELLER: 2,
};

function getPlanState(currentPlan: "FREE" | "PAID" | "RESELLER", targetPlan: "FREE" | "PAID" | "RESELLER") {
  const currentRank = planOrder[currentPlan];
  const targetRank = planOrder[targetPlan];

  if (currentRank === targetRank) {
    return "owned" as const;
  }

  if (currentRank > targetRank) {
    return "included" as const;
  }

  return "upgradable" as const;
}

type ActivityStatus = "SUCCESS" | "WARN" | "INFO";
type AlertTone = "SUCCESS" | "WARNING" | "INFO";

type RecentActivity = {
  id: string;
  action: string;
  detail: string;
  status: ActivityStatus;
  time: Date;
};

type SystemAlert = {
  id: string;
  title: string;
  description: string;
  tone: AlertTone;
  href?: string;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

function maskApiKey(value: string) {
  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 12)}...${value.slice(-6)}`;
}

function getUpgradeHint(plan: "FREE" | "PAID" | "RESELLER") {
  if (plan === "FREE") {
    return {
      title: "Upgrade recommendation: PAID",
      description: "Naik ke PAID untuk unlock all API dan total 5000 request/hari.",
      actionLabel: "Upgrade to PAID",
      href: "/dashboard/billing?plan=PAID",
    };
  }

  if (plan === "PAID") {
    return {
      title: "Upgrade recommendation: RESELLER",
      description: "Cocok kalau kamu perlu multi key hingga 25 API key untuk scale project/client.",
      actionLabel: "Upgrade to RESELLER",
      href: "/dashboard/billing?plan=RESELLER",
    };
  }

  return {
    title: "Top tier active",
    description: "Plan RESELLER sudah aktif. Semua fitur tertinggi sudah tersedia di akun kamu.",
    actionLabel: null,
    href: null,
  };
}

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await getOrProvisionDashboardUser(session.user.id);
  if (!currentUser) {
    redirect("/login");
  }

  const activeApiKeys = currentUser.apiKeys.filter((apiKey) => apiKey.status === "ACTIVE");
  const activeApiKeyIds = activeApiKeys.map((apiKey) => apiKey.id);
  const primaryApiKey = activeApiKeys[0] || null;
  const today = getUtcDateOnly(new Date());
  const todayMarker = new Date(today);
  todayMarker.setUTCHours(23, 59, 0, 0);

  const [marketplaceApis, usageLogsToday] = await Promise.all([
    getMarketplaceApis(),
    activeApiKeyIds.length > 0
      ? prisma.usageLog.findMany({
          where: {
            apiKeyId: { in: activeApiKeyIds },
            date: today,
          },
          select: {
            id: true,
            requestsCount: true,
            date: true,
            apiKey: {
              select: {
                id: true,
                label: true,
                status: true,
                dailyLimit: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const requestsToday = usageLogsToday.reduce((total, item) => total + item.requestsCount, 0);
  const totalEffectiveLimit = activeApiKeys.reduce(
    (total, apiKey) => total + getEffectiveDailyLimit(apiKey.dailyLimit, currentUser.referralBonusDaily),
    0,
  );
  const remainingLimit = Math.max(totalEffectiveLimit - requestsToday, 0);
  const usagePercent = totalEffectiveLimit > 0 ? requestsToday / totalEffectiveLimit : 0;

  const maintenanceApis = marketplaceApis.filter((api) => api.status === "MAINTENANCE");

  const stats = [
    { label: "Requests today", value: formatNumber(requestsToday) },
    { label: "Remaining limit", value: formatNumber(remainingLimit) },
    { label: "Active API keys", value: formatNumber(activeApiKeys.length) },
  ];

  const usageActivities: RecentActivity[] = usageLogsToday
    .filter((item) => item.requestsCount > 0)
    .sort((a, b) => b.requestsCount - a.requestsCount)
    .slice(0, 5)
    .map((item) => ({
      id: `usage-${item.id}`,
      action: "Usage tracked",
      detail: `${item.apiKey.label || "Default Key"} memproses ${formatNumber(item.requestsCount)} request hari ini.`,
      status: item.apiKey.status === "ACTIVE" ? "SUCCESS" : "WARN",
      time: todayMarker,
    }));

  const apiKeyActivities: RecentActivity[] = currentUser.apiKeys.slice(0, 5).map((apiKey) => ({
    id: `key-${apiKey.id}`,
    action: apiKey.status === "ACTIVE" ? "API key ready" : "API key revoked",
    detail: `${apiKey.label || "Default Key"} Â· limit ${formatNumber(apiKey.dailyLimit)}/day.`,
    status: apiKey.status === "ACTIVE" ? "INFO" : "WARN",
    time: apiKey.createdAt,
  }));

  const recentActivities = [...usageActivities, ...apiKeyActivities]
    .sort((a, b) => b.time.getTime() - a.time.getTime())
    .slice(0, 8);

  const systemAlerts: SystemAlert[] = [];

  if (!primaryApiKey) {
    systemAlerts.push({
      id: "missing-key",
      title: "Belum ada API key aktif",
      description: "Buat API key dulu agar endpoint bisa dipakai dari aplikasi kamu.",
      tone: "WARNING",
      href: "/dashboard/api-keys",
    });
  }

  if (usagePercent >= 0.8 && totalEffectiveLimit > 0) {
    systemAlerts.push({
      id: "quota",
      title: "Quota hampir habis",
      description: `Sisa ${formatNumber(remainingLimit)} dari total ${formatNumber(totalEffectiveLimit)} request hari ini.`,
      tone: "WARNING",
      href: "/#pricing",
    });
  }

  if (maintenanceApis.length > 0) {
    const samplePaths = maintenanceApis
      .slice(0, 2)
      .map((api) => api.path)
      .join(", ");

    systemAlerts.push({
      id: "maintenance",
      title: `${maintenanceApis.length} API maintenance`,
      description: samplePaths
        ? `Endpoint maintenance: ${samplePaths}${maintenanceApis.length > 2 ? ", ..." : ""}`
        : "Ada endpoint dalam mode maintenance.",
      tone: "INFO",
      href: "/dashboard/apis",
    });
  }

  if (systemAlerts.length === 0) {
    systemAlerts.push({
      id: "normal",
      title: "All systems normal",
      description: "Tidak ada alert aktif. Semua layanan utama akun kamu berjalan normal.",
      tone: "SUCCESS",
    });
  }

  const upgradeHint = getUpgradeHint(currentUser.plan);
  const sampleRequest = primaryApiKey
    ? `https://api.jzuv.my.id/api/country-time?country=id&apikey=${primaryApiKey.key}`
    : "https://api.jzuv.my.id/api/country-time?country=id&apikey=YOUR_API_KEY";

  const activityStatusClasses: Record<ActivityStatus, string> = {
    SUCCESS: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    WARN: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    INFO: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
  };

  const alertToneClasses: Record<AlertTone, string> = {
    SUCCESS: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
    WARNING: "border-amber-500/30 bg-amber-500/10 text-amber-500",
    INFO: "border-sky-500/30 bg-sky-500/10 text-sky-500",
  };

  const alertIcons: Record<AlertTone, typeof FaCheckCircle> = {
    SUCCESS: FaCheckCircle,
    WARNING: FaExclamationTriangle,
    INFO: FaBell,
  };

  return (
    <DashboardLayout
      userEmail={currentUser.email}
      userName={currentUser.name || "Developer"}
      userAvatarUrl={currentUser.avatarUrl}
      userPlan={currentUser.plan}
      userRole={currentUser.role}
    >
      <section className="animate-fade-in space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Dashboard
          </h2>
          <p className="text-sm text-zinc-500">Ringkasan penggunaan akun kamu hari ini.</p>
        </div>

        <DashboardQuickActions
          baseUrl="https://api.jzuv.my.id"
          testUrl={
            primaryApiKey
              ? `/api/country-time?country=id&apikey=${encodeURIComponent(primaryApiKey.key)}`
              : null
          }
        />

        <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/70">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">API Key Status</h3>
              <p className="mt-1 text-sm text-zinc-500">Kunci utama untuk auth request dari aplikasi kamu.</p>
            </div>
            <Link
              href="/dashboard/api-keys"
              className="inline-flex h-9 items-center rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Manage API Key
            </Link>
          </div>

          {primaryApiKey ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
              <article className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/50">
                <div className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
                  <FaKey className="text-sm" />
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Primary key</p>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-zinc-800 dark:text-zinc-200">
                  {maskApiKey(primaryApiKey.key)}
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  Label: {primaryApiKey.label || "Default Key"} | Limit: {formatNumber(primaryApiKey.dailyLimit)}/day
                </p>
              </article>

              <article className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/50">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Example request</p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-100 p-3 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                  {sampleRequest}
                </pre>
              </article>
            </div>
          ) : (
            <article className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-amber-500/20 p-2 text-amber-500">
                  <FaExclamationTriangle className="text-sm" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-amber-500">No API keys yet</p>
                  <p className="mt-1 text-sm text-zinc-300">
                    New keys and usage analytics will appear here. Buat API key dulu agar bisa mulai request endpoint.
                  </p>
                </div>
              </div>
            </article>
          )}
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((item, index) => (
            <article
              key={item.label}
              className="animate-slide-up rounded-2xl border border-zinc-200 bg-white/80 p-5 transition-transform duration-200 hover:-translate-y-0.5 dark:border-zinc-800/80 dark:bg-zinc-900/70"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <p className="text-sm text-zinc-500">{item.label}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {item.value}
              </p>
            </article>
          ))}
        </div>

        <div className="grid min-w-0 gap-4 xl:grid-cols-[1.6fr_1fr]">
          <section className="min-w-0 rounded-2xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/70">
            <div className="mb-4 flex flex-col items-start justify-between gap-1.5 sm:flex-row sm:items-end sm:gap-2">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Recent Activity</h3>
              <p className="text-xs text-zinc-500 sm:text-sm">Aktivitas penggunaan terbaru di akun kamu.</p>
            </div>

            <div className="space-y-2 md:hidden">
              {recentActivities.length === 0 ? (
                <article className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-950/40">
                  <p className="text-sm text-zinc-500">
                    Belum ada activity. Mulai request endpoint untuk melihat analytics.
                  </p>
                </article>
              ) : (
                recentActivities.map((activity) => (
                  <article
                    key={activity.id}
                    className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-950/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{activity.action}</p>
                      <span
                        className={[
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          activityStatusClasses[activity.status],
                        ].join(" ")}
                      >
                        {activity.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{activity.detail}</p>
                    <p className="mt-2 text-[11px] text-zinc-500">{formatDateTime(activity.time)}</p>
                  </article>
                ))
              )}
            </div>

            <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700 md:block">
              <table className="w-full min-w-[640px] divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
                <thead className="bg-zinc-100/80 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/80">
                  <tr>
                    <th className="px-3 py-3 text-left">Activity</th>
                    <th className="px-3 py-3 text-left">Detail</th>
                    <th className="px-3 py-3 text-left">Status</th>
                    <th className="px-3 py-3 text-left">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-zinc-50/60 dark:divide-zinc-700 dark:bg-zinc-950/40">
                  {recentActivities.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-sm text-zinc-500">
                        Belum ada activity. Mulai request endpoint untuk melihat analytics.
                      </td>
                    </tr>
                  ) : (
                    recentActivities.map((activity) => (
                      <tr key={activity.id}>
                        <td className="px-3 py-3 font-medium text-zinc-900 dark:text-zinc-100">{activity.action}</td>
                        <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">{activity.detail}</td>
                        <td className="px-3 py-3">
                          <span
                            className={[
                              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              activityStatusClasses[activity.status],
                            ].join(" ")}
                          >
                            {activity.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-zinc-500">{formatDateTime(activity.time)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="min-w-0 space-y-4">
            <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/70">
              <div className="mb-3 flex items-center gap-2">
                <FaSignal className="text-sm text-zinc-500" />
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">System Alert</h3>
              </div>

              <div className="space-y-2.5">
                {systemAlerts.map((alert) => {
                  const AlertIcon = alertIcons[alert.tone];

                  return (
                    <article
                      key={alert.id}
                      className={[
                        "overflow-hidden rounded-xl border p-3",
                        alertToneClasses[alert.tone],
                      ].join(" ")}
                    >
                      <div className="flex items-start gap-2">
                        <AlertIcon className="mt-0.5 text-sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{alert.title}</p>
                          <p className="mt-1 break-words text-xs text-zinc-600 dark:text-zinc-300">{alert.description}</p>
                          {alert.href ? (
                            <Link
                              href={alert.href}
                              className="mt-2 inline-flex text-xs font-semibold text-zinc-700 underline underline-offset-2 transition-colors hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-zinc-100"
                            >
                              View details
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/70">
              <div className="mb-3 flex items-center gap-2">
                <FaRocket className="text-sm text-zinc-500" />
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Plan Insight</h3>
              </div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{upgradeHint.title}</p>
              <p className="mt-1 text-sm text-zinc-500">{upgradeHint.description}</p>
              {upgradeHint.actionLabel && upgradeHint.href ? (
                <Link
                  href={upgradeHint.href}
                  className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  {upgradeHint.actionLabel}
                </Link>
              ) : (
                <span className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-500">
                  Owned
                </span>
              )}
            </section>
          </div>
        </div>

        <section className="rounded-2xl border border-zinc-200 bg-white/80 p-6 dark:border-zinc-800/80 dark:bg-zinc-900/70">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h3 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Purchase Role</h3>
            <p className="text-xs text-zinc-500 sm:text-sm">Upgrade role untuk limit lebih besar</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {PRICING_PLANS.map((plan) => {
              const planState = getPlanState(currentUser.plan, plan.name);

              return (
                <article
                  key={plan.name}
                  className={[
                    "flex h-full flex-col rounded-2xl border p-5 transition-transform duration-200 hover:-translate-y-1",
                    plan.highlight
                      ? "border-zinc-900 shadow-lg shadow-black/10 dark:border-zinc-100"
                      : "border-zinc-200 dark:border-zinc-800",
                  ].join(" ")}
                >
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{plan.name}</p>
                      {planState === "owned" ? (
                        <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">Owned</span>
                      ) : planState === "included" ? (
                        <span className="inline-flex rounded-full border border-zinc-400/40 bg-zinc-500/10 px-2 py-0.5 text-[11px] font-semibold text-zinc-400">Included</span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                      {plan.price}
                    </p>
                    <p className="mt-2 text-sm text-zinc-500">{plan.description}</p>
                    <ul className="mt-4 space-y-2">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <FaCheckCircle className="mt-0.5 text-xs text-emerald-500" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {planState === "owned" ? (
                    <span className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-500 opacity-90">
                      Owned
                    </span>
                  ) : planState === "included" ? (
                    <span className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-zinc-400/40 bg-zinc-500/10 px-4 text-sm font-medium text-zinc-300 opacity-90">
                      Included
                    </span>
                  ) : (
                    <Link
                      href={`/dashboard/billing?plan=${plan.name}`}
                      className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                    >
                      Purchase
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </DashboardLayout>
  );
}
