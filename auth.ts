import type { Prisma, PrismaClient } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "crypto";
import type { Session } from "next-auth";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";

import { generateUniqueApiKey } from "@/lib/api-key";
import { getBaseDailyLimitByPlanWithSettings } from "@/lib/api-key-rules";
import { normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";
import { generateUniqueReferralCode } from "@/lib/referral";
import { getSystemSettings } from "@/lib/system-settings";
import { verifyCaptchaToken } from "@/lib/turnstile";

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  captchaToken: z.string().trim().optional(),
});

const authUserSelect = {
  id: true,
  email: true,
  name: true,
  passwordHash: true,
  plan: true,
  role: true,
  isBlocked: true,
  blockedAt: true,
  banUntil: true,
  banReason: true,
} satisfies Prisma.UserSelect;

type DbClient = PrismaClient | Prisma.TransactionClient;

async function getAuthUserByEmail(db: DbClient, email: string) {
  return db.user.findUnique({
    where: { email },
    select: authUserSelect,
  });
}

async function ensureGoogleUser(email: string, name: string | null | undefined) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await getAuthUserByEmail(prisma, normalizedEmail);
  if (existing) {
    return existing;
  }

  const settings = await getSystemSettings();
  const freePlanDailyLimit = getBaseDailyLimitByPlanWithSettings("FREE", settings);
  const passwordHash = await hash(randomBytes(32).toString("hex"), 12);
  const sanitizedName = name?.trim() ? name.trim() : null;

  try {
    const createdUser = await prisma.$transaction(async (tx) => {
      const referralCode = await generateUniqueReferralCode(tx);
      const created = await tx.user.create({
        data: {
          email: normalizedEmail,
          name: sanitizedName,
          passwordHash,
          plan: "FREE",
          role: "USER",
          isBlocked: false,
          referralCode,
        },
        select: authUserSelect,
      });

      const key = await generateUniqueApiKey(tx);
      await tx.apiKey.create({
        data: {
          userId: created.id,
          key,
          label: "Default Key",
          status: "ACTIVE",
          dailyLimit: freePlanDailyLimit,
        },
      });

      return created;
    });

    return createdUser;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      const prismaCode = (error as { code?: string }).code;
      if (prismaCode === "P2002") {
        return getAuthUserByEmail(prisma, normalizedEmail);
      }
    }

    throw error;
  }
}

function isGoogleEmailVerified(profile: unknown) {
  if (!profile || typeof profile !== "object") {
    return true;
  }

  if (!("email_verified" in profile)) {
    return true;
  }

  return Boolean((profile as { email_verified?: unknown }).email_verified);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        captchaToken: { label: "Captcha Token", type: "text" },
      },
      authorize: async (credentials, request) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const captchaResult = await verifyCaptchaToken(request, parsed.data.captchaToken);
        if (!captchaResult.ok) {
          return null;
        }

        const email = parsed.data.email.toLowerCase();
        const user = await getAuthUserByEmail(prisma, email);
        if (!user) {
          return null;
        }

        const normalizedBan = await normalizeUserBanState(prisma, {
          id: user.id,
          isBlocked: user.isBlocked,
          blockedAt: user.blockedAt,
          banUntil: user.banUntil,
          banReason: user.banReason,
        });
        if (normalizedBan.isBlocked) {
          return null;
        }

        const isPasswordValid = await compare(parsed.data.password, user.passwordHash);
        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
          role: user.role,
          authProvider: "credentials" as const,
        };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                prompt: "select_account",
              },
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") {
        return true;
      }

      const email = user.email?.trim().toLowerCase();
      if (!email) {
        return false;
      }

      if (!isGoogleEmailVerified(profile)) {
        return false;
      }

      const dbUser = await ensureGoogleUser(email, user.name);
      if (!dbUser) {
        return false;
      }

      const normalizedBan = await normalizeUserBanState(prisma, {
        id: dbUser.id,
        isBlocked: dbUser.isBlocked,
        blockedAt: dbUser.blockedAt,
        banUntil: dbUser.banUntil,
        banReason: dbUser.banReason,
      });
      if (normalizedBan.isBlocked) {
        return "/login?blocked=1";
      }

      if (!dbUser.name && user.name?.trim()) {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { name: user.name.trim() },
        });
      }

      return true;
    },
    async jwt({ token, user, account }) {
      if (user?.id) {
        token.id = user.id;
      }

      if (user && "plan" in user && user.plan) {
        token.plan = user.plan as Session["user"]["plan"];
      }

      if (user && "role" in user && user.role) {
        token.role = user.role as Session["user"]["role"];
      }

      if (account?.provider === "google" || account?.provider === "credentials") {
        token.authProvider = account.provider;
      } else if (user && "authProvider" in user && user.authProvider) {
        token.authProvider = user.authProvider as Session["user"]["authProvider"];
      }

      const shouldHydrateFromDb = Boolean(user) || !token.id || !token.plan || !token.role;
      if (shouldHydrateFromDb && token.email) {
        const dbUser = await getAuthUserByEmail(prisma, token.email.toLowerCase());
        if (dbUser) {
          token.id = dbUser.id;
          token.plan = dbUser.plan;
          token.role = dbUser.role;
          token.name = dbUser.name ?? token.name;
        }
      }

      if (!token.authProvider) {
        token.authProvider = "credentials";
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id;
      }

      if (session.user) {
        session.user.plan = (token.plan as Session["user"]["plan"]) ?? "FREE";
        session.user.role = (token.role as Session["user"]["role"]) ?? "USER";
        session.user.authProvider = (token.authProvider as Session["user"]["authProvider"]) ?? "credentials";
      }

      return session;
    },
  },
});
