import { auth } from "@/auth";
import DashboardLayout from "@/components/DashboardLayout";
import ReferralPanel from "@/components/ReferralPanel";
import { getOrProvisionDashboardUser } from "@/lib/dashboard-user";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function DashboardReferralPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await getOrProvisionDashboardUser(session.user.id);
  if (!currentUser) {
    redirect("/login");
  }

  const publicBaseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
  const referralLink = `${publicBaseUrl}/register?ref=${currentUser.referralCode}`;

  const oneYearAgo = new Date();
  oneYearAgo.setUTCDate(oneYearAgo.getUTCDate() - 364);
  oneYearAgo.setUTCHours(0, 0, 0, 0);

  const referredUsers = await prisma.user.findMany({
    where: {
      referredById: currentUser.id,
      createdAt: {
        gte: oneYearAgo,
      },
    },
    select: {
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const dailySeriesMap = new Map<string, number>();
  for (const item of referredUsers) {
    const key = item.createdAt.toISOString().slice(0, 10);
    dailySeriesMap.set(key, (dailySeriesMap.get(key) || 0) + 1);
  }

  const dailySeries = Array.from(dailySeriesMap.entries()).map(([date, count]) => ({
    date,
    count,
  }));

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
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Referral Program</h2>
          <p className="text-sm text-zinc-500">
            Bagikan kode referral untuk mendapatkan bonus limit +250 per member valid.
          </p>
        </div>

        <ReferralPanel
          referralCode={currentUser.referralCode}
          referralLink={referralLink}
          referralCount={currentUser.referralCount}
          referralBonusDaily={currentUser.referralBonusDaily}
          dailySeries={dailySeries}
        />
      </section>
    </DashboardLayout>
  );
}
