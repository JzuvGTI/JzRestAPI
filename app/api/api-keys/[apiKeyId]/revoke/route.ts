import { NextResponse } from "next/server";

import { getApiKeyCreateRuleWithSettings } from "@/lib/api-key-rules";
import { getSessionUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/system-settings";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ apiKeyId: string }> },
) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { apiKeyId } = await context.params;
  if (!apiKeyId) {
    return NextResponse.json({ error: "API key id is required." }, { status: 400 });
  }

  const ownedApiKey = await prisma.apiKey.findFirst({
    where: {
      id: apiKeyId,
      userId: sessionUser.id,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!ownedApiKey) {
    return NextResponse.json({ error: "API key not found." }, { status: 404 });
  }

  if (ownedApiKey.status === "REVOKED") {
    return NextResponse.json({ message: "API key already revoked." }, { status: 200 });
  }

  const activeKeyCount = await prisma.apiKey.count({
    where: {
      userId: sessionUser.id,
      status: "ACTIVE",
    },
  });

  if (activeKeyCount <= 1) {
    const settings = await getSystemSettings();
    const createRule = getApiKeyCreateRuleWithSettings(sessionUser.plan, sessionUser.role, settings);

    if (!createRule.canCreate) {
      return NextResponse.json(
        { error: "Cannot revoke the last active API key for your plan. Upgrade or contact admin first." },
        { status: 400 },
      );
    }
  }

  await prisma.apiKey.update({
    where: { id: apiKeyId },
    data: { status: "REVOKED" },
  });

  return NextResponse.json({ message: "API key revoked." }, { status: 200 });
}
