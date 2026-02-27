import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/access";
import {
  DEFAULT_SYSTEM_SETTINGS,
  SYSTEM_SETTING_DEFINITIONS,
  SYSTEM_SETTING_KEYS,
  getSystemSettings,
} from "@/lib/system-settings";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const adminUser = await requireSuperAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const [merged, rows] = await Promise.all([
    getSystemSettings(),
    prisma.systemSetting.findMany({
      where: {
        key: {
          in: [...SYSTEM_SETTING_KEYS],
        },
      },
      select: {
        key: true,
        valueJson: true,
        updatedAt: true,
        updatedBy: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    }),
  ]);

  const rowByKey = new Map(rows.map((row) => [row.key, row]));

  return NextResponse.json(
    {
      settings: SYSTEM_SETTING_KEYS.map((key) => {
        const row = rowByKey.get(key);
        return {
          key,
          value: merged[key],
          defaultValue: DEFAULT_SYSTEM_SETTINGS[key],
          type: SYSTEM_SETTING_DEFINITIONS[key].kind,
          updatedAt: row?.updatedAt?.toISOString() || null,
          updatedBy: row?.updatedBy
            ? {
                id: row.updatedBy.id,
                name: row.updatedBy.name,
                email: row.updatedBy.email,
              }
            : null,
        };
      }),
      updatedAt: new Date().toISOString(),
    },
    { status: 200 },
  );
}
