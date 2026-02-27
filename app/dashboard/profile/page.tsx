import { redirect } from "next/navigation";

import { auth } from "@/auth";
import DashboardLayout from "@/components/DashboardLayout";
import ProfilePanel from "@/components/ProfilePanel";
import { getOrProvisionDashboardUser, getUtcDateOnly } from "@/lib/dashboard-user";
import { prisma } from "@/lib/prisma";

export default async function DashboardProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await getOrProvisionDashboardUser(session.user.id);
  if (!currentUser) {
    redirect("/login");
  }

  const today = getUtcDateOnly(new Date());

  const [totalApiKeys, activeApiKeys, totalRequestsAgg, requestsTodayAgg] = await Promise.all([
    prisma.apiKey.count({
      where: {
        userId: currentUser.id,
      },
    }),
    prisma.apiKey.count({
      where: {
        userId: currentUser.id,
        status: "ACTIVE",
      },
    }),
    prisma.usageLog.aggregate({
      where: {
        apiKey: {
          userId: currentUser.id,
        },
      },
      _sum: {
        requestsCount: true,
      },
    }),
    prisma.usageLog.aggregate({
      where: {
        apiKey: {
          userId: currentUser.id,
        },
        date: today,
      },
      _sum: {
        requestsCount: true,
      },
    }),
  ]);

  return (
    <DashboardLayout
      userEmail={currentUser.email}
      userName={currentUser.name || "Developer"}
      userAvatarUrl={currentUser.avatarUrl}
      userPlan={currentUser.plan}
      userRole={currentUser.role}
    >
      <section className="animate-fade-in space-y-5">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Profile</h2>
          <p className="text-sm text-zinc-500">
            Kelola data akun, keamanan password, dan foto profil kamu.
          </p>
        </div>

        <ProfilePanel
          profile={{
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
            avatarUrl: currentUser.avatarUrl,
            plan: currentUser.plan,
            role: currentUser.role,
            createdAt: currentUser.createdAt.toISOString(),
          }}
          stats={{
            totalApiKeys,
            activeApiKeys,
            totalRequests: totalRequestsAgg._sum.requestsCount || 0,
            requestsToday: requestsTodayAgg._sum.requestsCount || 0,
          }}
        />
      </section>
    </DashboardLayout>
  );
}
