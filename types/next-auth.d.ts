import type { DefaultSession } from "next-auth";

type Plan = "FREE" | "PAID" | "RESELLER";
type UserRole = "USER" | "SUPERADMIN";
type AuthProvider = "credentials" | "google";

declare module "next-auth" {
  interface User {
    plan: Plan;
    role: UserRole;
    authProvider?: AuthProvider;
  }

  interface Session {
    user: {
      id: string;
      plan: Plan;
      role: UserRole;
      authProvider: AuthProvider;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    plan?: Plan;
    role?: UserRole;
    authProvider?: AuthProvider;
  }
}
