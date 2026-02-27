import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const revealSchema = z.object({
  apiKeyId: z.string().min(1, "API key id is required."),
  password: z.string().optional(),
});

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser?.id) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  const parsed = revealSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request data." },
      { status: 400 },
    );
  }

  if (sessionUser.authProvider !== "google") {
    const plainPassword = parsed.data.password?.trim() || "";
    if (!plainPassword) {
      return NextResponse.json(
        { error: "Password is required." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { passwordHash: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 },
      );
    }

    const passwordValid = await compare(plainPassword, user.passwordHash);
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Password is incorrect." },
        { status: 401 },
      );
    }
  }

  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id: parsed.data.apiKeyId,
      userId: sessionUser.id,
      status: "ACTIVE",
    },
    select: {
      id: true,
      key: true,
    },
  });

  if (!apiKey) {
    return NextResponse.json(
      { error: "API key not found." },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      key: apiKey.key,
    },
    { status: 200 },
  );
}
