import type { Plan } from "@prisma/client";

export const BILLING_PLAN_PRICE_IDR: Record<Exclude<Plan, "FREE">, number> = {
  PAID: 5000,
  RESELLER: 15000,
};

const planRank: Record<Plan, number> = {
  FREE: 0,
  PAID: 1,
  RESELLER: 2,
};

export function isPlanOwnedOrIncluded(currentPlan: Plan, targetPlan: Plan) {
  return planRank[currentPlan] >= planRank[targetPlan];
}

export function getInvoicePeriodRange(days = 30) {
  const startAt = new Date();
  const endAt = new Date(startAt);
  endAt.setUTCDate(endAt.getUTCDate() + days);

  return { startAt, endAt };
}
