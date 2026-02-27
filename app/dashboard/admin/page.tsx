import { redirect } from "next/navigation";

import { auth } from "@/auth";
import DashboardLayout from "@/components/DashboardLayout";
import SuperAdminPanel from "@/components/SuperAdminPanel";
import { getOrProvisionDashboardUser } from "@/lib/dashboard-user";

export default async function DashboardAdminPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await getOrProvisionDashboardUser(session.user.id);
  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.role !== "SUPERADMIN") {
    redirect("/dashboard");
  }

  return (
    <DashboardLayout
      userEmail={currentUser.email}
      userName={currentUser.name || "Super Admin"}
      userAvatarUrl={currentUser.avatarUrl}
      userPlan={currentUser.plan}
      userRole={currentUser.role}
    >
      <section className="animate-fade-in space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Super Admin</h2>
          <p className="text-sm text-zinc-500">
            Pusat kontrol penuh untuk users, API keys, endpoint governance, billing, settings, dan audit.
          </p>
        </div>

        <SuperAdminPanel />
      </section>
    </DashboardLayout>
  );
}
