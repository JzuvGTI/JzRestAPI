import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { generateUniqueApiKey } from "@/lib/api-key";
import { getBaseDailyLimitByPlanWithSettings } from "@/lib/api-key-rules";
import { prisma } from "@/lib/prisma";
import { generateUniqueReferralCode } from "@/lib/referral";
import { getSystemSettings } from "@/lib/system-settings";
import { verifyCaptchaToken } from "@/lib/turnstile";

export const runtime = "nodejs";

const registerSchema = z
  .object({
    name: z.string().trim().max(60).optional(),
    email: z.string().trim().email("Please enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(8, "Password confirmation must be at least 8 characters."),
    referralCode: z.string().trim().optional(),
    captchaToken: z.string().trim().optional(),
  })
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (password !== confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match.",
        path: ["confirmPassword"],
      });
    }
  });

class InvalidReferralError extends Error {}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please correct the highlighted fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const captchaResult = await verifyCaptchaToken(request, parsed.data.captchaToken);
  if (!captchaResult.ok) {
    return NextResponse.json(
      {
        error: "Captcha verification failed.",
        fieldErrors: { captcha: ["Please complete captcha verification."] },
      },
      { status: 400 },
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json(
      {
        error: "An account with this email already exists.",
        fieldErrors: { email: ["Email is already registered."] },
      },
      { status: 409 },
    );
  }

  const passwordHash = await hash(parsed.data.password, 12);
  const name = parsed.data.name?.trim() ? parsed.data.name.trim() : null;
  const referralCodeInput = parsed.data.referralCode?.trim().toUpperCase() || "";

  if (referralCodeInput && !/^[A-Z0-9]{6,12}$/.test(referralCodeInput)) {
    return NextResponse.json(
      {
        error: "Invalid referral code format.",
        fieldErrors: { referralCode: ["Referral code must be 6-12 alphanumeric characters."] },
      },
      { status: 400 },
    );
  }

  try {
    const settings = await getSystemSettings();
    const freePlanDailyLimit = getBaseDailyLimitByPlanWithSettings("FREE", settings);
    const referralBonusPerInvite = Math.max(0, Number(settings.REFERRAL_BONUS_PER_INVITE) || 250);

    await prisma.$transaction(async (tx) => {
      const ownReferralCode = await generateUniqueReferralCode(tx);
      let referredById: string | null = null;

      if (referralCodeInput) {
        const referrer = await tx.user.findUnique({
          where: { referralCode: referralCodeInput },
          select: { id: true },
        });

        if (!referrer) {
          throw new InvalidReferralError("Referral code not found.");
        }

        referredById = referrer.id;
      }

      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          plan: "FREE",
          role: "USER",
          isBlocked: false,
          referralCode: ownReferralCode,
          referredById,
        },
        select: { id: true },
      });

      const apiKey = await generateUniqueApiKey(tx);

      await tx.apiKey.create({
        data: {
          userId: user.id,
          key: apiKey,
          label: "Default Key",
          status: "ACTIVE",
          dailyLimit: freePlanDailyLimit,
        },
      });

      if (referredById) {
        await tx.user.update({
          where: { id: referredById },
          data: {
            referralCount: { increment: 1 },
            referralBonusDaily: { increment: referralBonusPerInvite },
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof InvalidReferralError) {
      return NextResponse.json(
        {
          error: "Referral code is invalid.",
          fieldErrors: { referralCode: ["Referral code not found."] },
        },
        { status: 400 },
      );
    }

    if (typeof error === "object" && error !== null && "code" in error) {
      const prismaCode = (error as { code?: string }).code;
      if (prismaCode === "P2002") {
        return NextResponse.json(
          {
            error: "An account with this email already exists.",
            fieldErrors: { email: ["Email is already registered."] },
          },
          { status: 409 },
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to register account. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { message: "Registration successful. Please log in." },
    { status: 201 },
  );
}
