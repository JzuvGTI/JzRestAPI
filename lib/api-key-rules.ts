import type { Plan, UserRole } from "@prisma/client";
import type { SystemSettingMap } from "@/lib/system-settings";

export function getBaseDailyLimitByPlan(plan: Plan) {
  if (plan === "FREE") {
    return 100;
  }
  if (plan === "RESELLER") {
    return 500;
  }
  return 5000;
}

export function getApiKeyCreateRule(plan: Plan, role: UserRole) {
  if (role === "SUPERADMIN") {
    return {
      canCreate: true,
      maxKeys: 9999,
      maxLimitPerKey: 5000,
    };
  }

  if (plan === "RESELLER") {
    return {
      canCreate: true,
      maxKeys: 25,
      maxLimitPerKey: 500,
    };
  }

  return {
    canCreate: false,
    maxKeys: 1,
    maxLimitPerKey: getBaseDailyLimitByPlan(plan),
  };
}

export function getBaseDailyLimitByPlanWithSettings(plan: Plan, settings?: SystemSettingMap | null) {
  if (!settings) {
    return getBaseDailyLimitByPlan(plan);
  }

  if (plan === "FREE") {
    return Number(settings.FREE_DAILY_LIMIT) || 100;
  }

  if (plan === "RESELLER") {
    return Number(settings.RESELLER_DAILY_LIMIT) || 500;
  }

  return Number(settings.PAID_DAILY_LIMIT) || 5000;
}

export function getApiKeyCreateRuleWithSettings(
  plan: Plan,
  role: UserRole,
  settings?: SystemSettingMap | null,
) {
  if (!settings) {
    return getApiKeyCreateRule(plan, role);
  }

  if (role === "SUPERADMIN") {
    return {
      canCreate: true,
      maxKeys: 9999,
      maxLimitPerKey: Number(settings.PAID_DAILY_LIMIT) || 5000,
    };
  }

  if (plan === "RESELLER") {
    return {
      canCreate: true,
      maxKeys: Math.max(1, Number(settings.RESELLER_MAX_KEYS) || 25),
      maxLimitPerKey: Math.max(1, Number(settings.RESELLER_MAX_LIMIT_PER_KEY) || 500),
    };
  }

  return {
    canCreate: false,
    maxKeys: 1,
    maxLimitPerKey: getBaseDailyLimitByPlanWithSettings(plan, settings),
  };
}
