import { redirect } from "next/navigation";

import { auth } from "@/auth";
import BillingPanel from "@/components/BillingPanel";
import DashboardLayout from "@/components/DashboardLayout";
import { getOrProvisionDashboardUser } from "@/lib/dashboard-user";
import { prisma } from "@/lib/prisma";

type BillingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardBillingPage({ searchParams }: BillingPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await getOrProvisionDashboardUser(session.user.id);
  if (!currentUser) {
    redirect("/login");
  }

  const resolvedSearchParams = (await searchParams) || {};
  const rawPlan = Array.isArray(resolvedSearchParams.plan)
    ? resolvedSearchParams.plan[0]
    : resolvedSearchParams.plan;
  const normalizedPlan = rawPlan === "RESELLER" ? "RESELLER" : "PAID";

  const invoices = await prisma.billingInvoice.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      plan: true,
      amount: true,
      currency: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      paymentMethod: true,
      paymentProofUrl: true,
      notes: true,
      approvedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

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
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Billing</h2>
          <p className="text-sm text-zinc-500">
            Kelola invoice pembelian plan dan upload bukti pembayaran manual.
          </p>
        </div>

        <BillingPanel
          currentPlan={currentUser.plan}
          initialPlan={normalizedPlan}
          invoices={invoices.map((invoice) => ({
            id: invoice.id,
            plan: invoice.plan,
            amount: invoice.amount,
            currency: invoice.currency,
            status: invoice.status,
            periodStart: invoice.periodStart.toISOString(),
            periodEnd: invoice.periodEnd.toISOString(),
            paymentMethod: invoice.paymentMethod,
            paymentProofUrl: invoice.paymentProofUrl,
            notes: invoice.notes,
            approvedAt: invoice.approvedAt ? invoice.approvedAt.toISOString() : null,
            createdAt: invoice.createdAt.toISOString(),
            updatedAt: invoice.updatedAt.toISOString(),
            awaitingReview: invoice.status === "UNPAID" && Boolean(invoice.paymentProofUrl),
          }))}
        />
      </section>
    </DashboardLayout>
  );
}
