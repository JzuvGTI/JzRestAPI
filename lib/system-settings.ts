import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const SYSTEM_SETTING_KEYS = [
  "FREE_DAILY_LIMIT",
  "PAID_DAILY_LIMIT",
  "RESELLER_DAILY_LIMIT",
  "RESELLER_MAX_KEYS",
  "RESELLER_MAX_LIMIT_PER_KEY",
  "REFERRAL_BONUS_PER_INVITE",
  "BILLING_DEFAULT_CURRENCY",
  "ACCOUNT_STATUS_POLL_MS",
  "AUTH_CAPTCHA_ENABLED",
] as const;

export type SystemSettingKey = (typeof SYSTEM_SETTING_KEYS)[number];

export type SystemSettingMap = Record<SystemSettingKey, string | number | boolean>;

type SystemSettingKind = "number" | "string" | "boolean";

type SystemSettingDefinition = {
  kind: SystemSettingKind;
  min?: number;
  max?: number;
  maxLength?: number;
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingMap = {
  FREE_DAILY_LIMIT: 100,
  PAID_DAILY_LIMIT: 5000,
  RESELLER_DAILY_LIMIT: 500,
  RESELLER_MAX_KEYS: 25,
  RESELLER_MAX_LIMIT_PER_KEY: 500,
  REFERRAL_BONUS_PER_INVITE: 250,
  BILLING_DEFAULT_CURRENCY: "IDR",
  ACCOUNT_STATUS_POLL_MS: 15_000,
  AUTH_CAPTCHA_ENABLED: true,
};

export const SYSTEM_SETTING_DEFINITIONS: Record<SystemSettingKey, SystemSettingDefinition> = {
  FREE_DAILY_LIMIT: { kind: "number", min: 1, max: 1_000_000 },
  PAID_DAILY_LIMIT: { kind: "number", min: 1, max: 1_000_000 },
  RESELLER_DAILY_LIMIT: { kind: "number", min: 1, max: 1_000_000 },
  RESELLER_MAX_KEYS: { kind: "number", min: 1, max: 1000 },
  RESELLER_MAX_LIMIT_PER_KEY: { kind: "number", min: 1, max: 1_000_000 },
  REFERRAL_BONUS_PER_INVITE: { kind: "number", min: 0, max: 100_000 },
  BILLING_DEFAULT_CURRENCY: { kind: "string", maxLength: 10 },
  ACCOUNT_STATUS_POLL_MS: { kind: "number", min: 3000, max: 120_000 },
  AUTH_CAPTCHA_ENABLED: { kind: "boolean" },
};

function isKnownKey(value: string): value is SystemSettingKey {
  return SYSTEM_SETTING_KEYS.includes(value as SystemSettingKey);
}

const globalSettingsCache = globalThis as unknown as {
  __systemSettingsCache?: {
    fetchedAt: number;
    data: SystemSettingMap;
  };
};

const CACHE_TTL_MS = 30_000;

export async function getSystemSettings(options?: { force?: boolean }) {
  const force = options?.force === true;
  const now = Date.now();

  if (
    !force &&
    globalSettingsCache.__systemSettingsCache &&
    now - globalSettingsCache.__systemSettingsCache.fetchedAt < CACHE_TTL_MS
  ) {
    return globalSettingsCache.__systemSettingsCache.data;
  }

  const rows = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: [...SYSTEM_SETTING_KEYS],
      },
    },
    select: {
      key: true,
      valueJson: true,
    },
  });

  const merged: SystemSettingMap = { ...DEFAULT_SYSTEM_SETTINGS };
  for (const row of rows) {
    if (!isKnownKey(row.key)) {
      continue;
    }

    const value = row.valueJson;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      merged[row.key] = value;
    }
  }

  globalSettingsCache.__systemSettingsCache = {
    fetchedAt: now,
    data: merged,
  };

  return merged;
}

export async function upsertSystemSetting(
  key: SystemSettingKey,
  value: Prisma.InputJsonValue,
  updatedById: string,
) {
  const record = await prisma.systemSetting.upsert({
    where: { key },
    create: {
      key,
      valueJson: value,
      updatedById,
    },
    update: {
      valueJson: value,
      updatedById,
    },
  });

  globalSettingsCache.__systemSettingsCache = undefined;
  return record;
}

function asFiniteNumber(input: unknown) {
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }

  if (typeof input === "string") {
    const parsed = Number.parseFloat(input);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function normalizeSystemSettingValue(key: SystemSettingKey, value: unknown) {
  const definition = SYSTEM_SETTING_DEFINITIONS[key];

  if (definition.kind === "number") {
    const numeric = asFiniteNumber(value);
    if (numeric === null) {
      return {
        ok: false as const,
        error: `Setting ${key} must be a number.`,
      };
    }

    const integer = Math.trunc(numeric);
    if (definition.min !== undefined && integer < definition.min) {
      return {
        ok: false as const,
        error: `Setting ${key} must be >= ${definition.min}.`,
      };
    }

    if (definition.max !== undefined && integer > definition.max) {
      return {
        ok: false as const,
        error: `Setting ${key} must be <= ${definition.max}.`,
      };
    }

    return {
      ok: true as const,
      value: integer,
    };
  }

  if (definition.kind === "boolean") {
    if (typeof value === "boolean") {
      return {
        ok: true as const,
        value,
      };
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1" || normalized === "yes") {
        return {
          ok: true as const,
          value: true,
        };
      }

      if (normalized === "false" || normalized === "0" || normalized === "no") {
        return {
          ok: true as const,
          value: false,
        };
      }
    }

    return {
      ok: false as const,
      error: `Setting ${key} must be boolean.`,
    };
  }

  if (typeof value !== "string") {
    return {
      ok: false as const,
      error: `Setting ${key} must be a string.`,
    };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return {
      ok: false as const,
      error: `Setting ${key} cannot be empty.`,
    };
  }

  if (definition.maxLength && trimmed.length > definition.maxLength) {
    return {
      ok: false as const,
      error: `Setting ${key} must be <= ${definition.maxLength} characters.`,
    };
  }

  if (key === "BILLING_DEFAULT_CURRENCY") {
    const normalized = trimmed.toUpperCase();
    if (!/^[A-Z]{3,10}$/.test(normalized)) {
      return {
        ok: false as const,
        error: "Currency must be 3-10 uppercase letters (e.g. IDR).",
      };
    }

    return {
      ok: true as const,
      value: normalized,
    };
  }

  return {
    ok: true as const,
    value: trimmed,
  };
}
