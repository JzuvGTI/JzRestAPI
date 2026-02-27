"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { FormEvent, useEffect, useState } from "react";
import { FaGift, FaGoogle, FaLink, FaRocket, FaShieldAlt, FaUserPlus } from "react-icons/fa";

import AuthCard from "@/components/AuthCard";
import Button from "@/components/Button";
import Input from "@/components/Input";
import TurnstileWidget from "@/components/TurnstileWidget";
import { useToast } from "@/components/ToastProvider";

type RegisterFieldErrors = Partial<Record<"name" | "email" | "password" | "confirmPassword" | "referralCode" | "captcha", string[]>>;

type RegisterResponse = {
  error?: string;
  message?: string;
  fieldErrors?: RegisterFieldErrors;
};

type CaptchaConfigResponse = {
  enabled: boolean;
  siteKey: string | null;
  configured: boolean;
};

const registerStats = [
  { label: "Starter plan", value: "FREE" },
  { label: "Daily quota", value: "100+" },
  { label: "Referral bonus", value: "+250" },
];

const registerFeatures = [
  {
    title: "Fast onboarding",
    description: "Daftar, login, lalu langsung dapat default API key untuk mulai integrasi.",
    icon: FaUserPlus,
  },
  {
    title: "Referral growth",
    description: "Ajak user baru pakai referral code dan dapat bonus limit harian otomatis.",
    icon: FaLink,
  },
  {
    title: "Secure by default",
    description: "Session JWT, password hash bcrypt, dan proteksi akses dashboard.",
    icon: FaShieldAlt,
  },
];

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const ref = new URLSearchParams(window.location.search).get("ref");
    return ref ? ref.toUpperCase() : "";
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaSiteKey, setCaptchaSiteKey] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);
  const [isCaptchaReady, setIsCaptchaReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");

    if (!error) {
      return;
    }

    const message =
      error === "AccessDenied"
        ? "Google sign up ditolak. Pastikan email Google sudah terverifikasi."
        : "Google sign up gagal. Coba lagi beberapa saat.";

    setErrorMessage(message);
    toast.error(message, "Google sign up failed");

    params.delete("error");
    const nextQuery = params.toString();
    const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;

    const loadCaptchaConfig = async () => {
      try {
        const response = await fetch("/api/auth/captcha-config", { cache: "no-store" });
        if (!response.ok || cancelled) {
          return;
        }

        const data = (await response.json()) as CaptchaConfigResponse;
        if (cancelled) {
          return;
        }

        setCaptchaEnabled(Boolean(data.enabled));
        setCaptchaSiteKey(data.siteKey);
        setIsCaptchaReady(true);
      } catch {
        if (!cancelled) {
          setCaptchaEnabled(false);
          setCaptchaSiteKey(null);
          setIsCaptchaReady(true);
        }
      }
    };

    void loadCaptchaConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setFieldErrors({});

    if (password.length < 8) {
      const message = "Password must be at least 8 characters.";
      setFieldErrors({ password: [message] });
      toast.warning(message, "Validation");
      return;
    }

    if (password !== confirmPassword) {
      const message = "Passwords do not match.";
      setFieldErrors({ confirmPassword: [message] });
      toast.warning(message, "Validation");
      return;
    }

    if (captchaEnabled) {
      if (!captchaSiteKey) {
        const message = "Captcha belum terkonfigurasi. Hubungi super admin.";
        setErrorMessage(message);
        toast.error(message, "Captcha config error");
        return;
      }

      if (!captchaToken) {
        const message = "Please complete captcha verification.";
        setErrorMessage(message);
        setFieldErrors({ captcha: [message] });
        toast.warning(message, "Validation");
        return;
      }
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword, referralCode, captchaToken }),
      });

      const data = (await response.json()) as RegisterResponse;
      setIsLoading(false);

      if (!response.ok) {
        const message = data.error || "Registration failed.";
        setErrorMessage(message);
        setFieldErrors(data.fieldErrors || {});
        toast.error(message, "Register failed");
        setCaptchaToken(null);
        setCaptchaResetSignal((current) => current + 1);
        return;
      }

      router.push("/login?registered=1");
    } catch {
      setIsLoading(false);
      const message = "Network error. Please try again.";
      setErrorMessage(message);
      toast.error(message, "Register failed");
      return;
    }
  };

  const handleGoogleSignUp = async () => {
    setErrorMessage("");
    setIsGoogleLoading(true);
    await signIn("google", { callbackUrl: "/dashboard" });
    setIsGoogleLoading(false);
  };

  return (
    <main className="relative isolate min-h-screen overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute -left-28 top-16 h-72 w-72 rounded-full bg-zinc-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-8 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-800/70" />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="animate-fade-in hidden rounded-3xl border border-zinc-800/80 bg-zinc-950/50 p-7 backdrop-blur-xl lg:block">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <FaRocket className="text-[10px]" />
            New Account Onboarding
          </p>

          <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-zinc-100">
            Create your account and start using JzREST API
          </h2>
          <p className="mt-3 max-w-xl text-sm text-zinc-400">
            Mulai dari plan FREE, kelola API key, dan scale quota sesuai kebutuhan project kamu.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {registerStats.map((item) => (
              <article key={item.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <p className="text-lg font-semibold text-zinc-100">{item.value}</p>
                <p className="mt-1 text-xs text-zinc-500">{item.label}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            {registerFeatures.map((feature) => {
              const Icon = feature.icon;

              return (
                <article key={feature.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-zinc-300">
                      <Icon className="text-xs" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-100">{feature.title}</p>
                      <p className="mt-1 text-xs text-zinc-400">{feature.description}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
              <FaGift className="text-[10px]" />
              Pro tip
            </p>
            <p className="mt-2 text-sm text-zinc-200">
              Masukkan referral code saat register untuk langsung mendukung growth network tim kamu.
            </p>
          </div>
        </section>

        <section className="w-full lg:justify-self-end">
          <div className="mb-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 lg:hidden">
            <p className="text-sm font-medium text-zinc-200">Create account and get FREE plan instantly</p>
            <p className="mt-1 text-xs text-zinc-400">Start with secure auth, default API key, and daily request limit.</p>
          </div>

          <AuthCard
            title="Create account"
            subtitle="Start with the FREE plan and scale later"
            footer={
              <>
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-zinc-200 transition-colors hover:text-white">
                  Sign in
                </Link>
              </>
            }
          >
            <div className="space-y-4">
              <Button
                type="button"
                fullWidth
                variant="secondary"
                isLoading={isGoogleLoading}
                loadingText="Redirecting to Google..."
                onClick={handleGoogleSignUp}
                className="gap-2 border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
              >
                <FaGoogle className="text-sm" />
                Continue with Google
              </Button>

              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span className="h-px flex-1 bg-zinc-700/60" />
                <span>or register with email</span>
                <span className="h-px flex-1 bg-zinc-700/60" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  id="name"
                  label="Name (optional)"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="John Doe"
                  error={fieldErrors.name?.[0]}
                  autoComplete="name"
                />
                <Input
                  id="email"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  error={fieldErrors.email?.[0]}
                  autoComplete="email"
                  required
                />
                <Input
                  id="password"
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  error={fieldErrors.password?.[0]}
                  autoComplete="new-password"
                  required
                />
                <Input
                  id="confirmPassword"
                  label="Confirm password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter your password"
                  error={fieldErrors.confirmPassword?.[0]}
                  autoComplete="new-password"
                  required
                />
                <Input
                  id="referralCode"
                  label="Referral code (optional)"
                  type="text"
                  value={referralCode}
                  onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                  placeholder="e.g. A8BC2K9L"
                  error={fieldErrors.referralCode?.[0]}
                  autoComplete="off"
                />
                {captchaEnabled ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-200">Captcha</label>
                    {isCaptchaReady && captchaSiteKey ? (
                      <TurnstileWidget
                        siteKey={captchaSiteKey}
                        onTokenChange={setCaptchaToken}
                        resetSignal={captchaResetSignal}
                      />
                    ) : isCaptchaReady ? (
                      <p className="text-xs text-red-300">Captcha config is missing. Contact super admin.</p>
                    ) : (
                      <p className="text-xs text-zinc-500">Loading captcha...</p>
                    )}
                    {fieldErrors.captcha?.[0] ? <p className="text-xs text-red-300">{fieldErrors.captcha[0]}</p> : null}
                  </div>
                ) : null}

                {errorMessage ? (
                  <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {errorMessage}
                  </div>
                ) : null}

                <Button type="submit" fullWidth isLoading={isLoading} loadingText="Creating account...">
                  <span className="inline-flex items-center gap-2">
                    Register
                    {!isLoading ? <FaUserPlus className="text-xs" /> : null}
                  </span>
                </Button>
              </form>
            </div>
          </AuthCard>
        </section>
      </div>
    </main>
  );
}
