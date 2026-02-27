import { auth } from "@/auth";
import ApiKeysManager from "@/components/ApiKeysManager";
import DashboardLayout from "@/components/DashboardLayout";
import { getApiKeyCreateRuleWithSettings, getBaseDailyLimitByPlanWithSettings } from "@/lib/api-key-rules";
import { getOrProvisionDashboardUser, getUtcDateOnly } from "@/lib/dashboard-user";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/system-settings";
import { redirect } from "next/navigation";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function maskApiKey(value: string) {
  if (value.length <= 14) {
    return value;
  }
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function getDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export default async function DashboardApiKeysPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await getOrProvisionDashboardUser(session.user.id);
  if (!currentUser) {
    redirect("/login");
  }

  const settings = await getSystemSettings();
  const rule = getApiKeyCreateRuleWithSettings(currentUser.plan, currentUser.role, settings);
  const recommendedLimit = getBaseDailyLimitByPlanWithSettings(currentUser.plan, settings);
  const today = getUtcDateOnly(new Date());

  const trendStart = new Date(today);
  trendStart.setUTCDate(trendStart.getUTCDate() - 6);

  const trendDates = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(trendStart);
    day.setUTCDate(trendStart.getUTCDate() + index);
    return day;
  });

  const [usageRows, lastUsedRows] = await Promise.all([
    prisma.usageLog.findMany({
      where: {
        apiKey: {
          userId: currentUser.id,
        },
        date: {
          gte: trendStart,
          lte: today,
        },
      },
      select: {
        apiKeyId: true,
        date: true,
        requestsCount: true,
      },
    }),
    prisma.usageLog.groupBy({
      by: ["apiKeyId"],
      where: {
        apiKey: {
          userId: currentUser.id,
        },
      },
      _max: {
        date: true,
      },
    }),
  ]);

  const usageByKey = new Map<string, Map<string, number>>();
  for (const row of usageRows) {
    const perDay = usageByKey.get(row.apiKeyId) ?? new Map<string, number>();
    perDay.set(getDateKey(row.date), row.requestsCount);
    usageByKey.set(row.apiKeyId, perDay);
  }

  const lastUsedByKey = new Map<string, string | null>(
    lastUsedRows.map((row) => [row.apiKeyId, row._max.date ? row._max.date.toISOString() : null]),
  );

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
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Manage API KEY</h2>
          <p className="text-sm text-zinc-500">
            Kelola API key kamu. Role reseller: maksimal 25 key, limit maksimal 500 per key.
          </p>
        </div>

        <section className="rounded-2xl border border-zinc-200 bg-white/80 p-6 dark:border-zinc-800/80 dark:bg-zinc-900/70">
          <ApiKeysManager
            apiKeys={currentUser.apiKeys.map((apiKey) => ({
              id: apiKey.id,
              label: apiKey.label,
              dailyLimit: apiKey.dailyLimit,
              status: apiKey.status,
              maskedKey: maskApiKey(apiKey.key),
              createdAt: apiKey.createdAt.toISOString(),
              lastUsedAt: lastUsedByKey.get(apiKey.id) || null,
              usage7dSeries: trendDates.map((day) => usageByKey.get(apiKey.id)?.get(getDateKey(day)) || 0),
              usage7dTotal: trendDates.reduce(
                (total, day) => total + (usageByKey.get(apiKey.id)?.get(getDateKey(day)) || 0),
                0,
              ),
              rotationDays: Math.max(
                0,
                Math.floor((today.getTime() - getUtcDateOnly(apiKey.createdAt).getTime()) / MS_PER_DAY),
              ),
            }))}
            canCreate={rule.canCreate}
            maxKeys={rule.maxKeys}
            maxLimitPerKey={rule.maxLimitPerKey}
            recommendedLimit={recommendedLimit}
            authProvider={session.user.authProvider ?? "credentials"}
          />
        </section>
      </section>
    </DashboardLayout>
  );
}
