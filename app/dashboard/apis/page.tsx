import { auth } from "@/auth";
import ApiListAccordion from "@/components/ApiListAccordion";
import DashboardLayout from "@/components/DashboardLayout";
import { getMarketplaceApis } from "@/lib/api-endpoints";
import { getOrProvisionDashboardUser } from "@/lib/dashboard-user";
import { redirect } from "next/navigation";

export default async function DashboardApisPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await getOrProvisionDashboardUser(session.user.id);
  if (!currentUser) {
    redirect("/login");
  }

  const apiDomain = "https://api.jzuv.my.id";
  const marketplaceApis = await getMarketplaceApis();

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
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">REST API LIST</h2>
          <p className="text-sm text-zinc-500">
            Endpoint tersedia, cara request, dan contoh response JSON.
          </p>
        </div>

        <section className="rounded-2xl border border-zinc-200 bg-white/80 p-6 dark:border-zinc-800/80 dark:bg-zinc-900/70">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Available API</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Endpoint dikelompokkan per kategori. Klik item untuk buka tutorial, detail request/response, dan gunakan tombol copy.
          </p>

          <div className="mt-4">
            <ApiListAccordion
              apis={marketplaceApis}
              apiDomain={apiDomain}
              apiKeySample="YOUR_API_KEY"
            />
          </div>
        </section>
      </section>
    </DashboardLayout>
  );
}
