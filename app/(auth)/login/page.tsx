"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { FormEvent, useEffect, useState } from "react";
import { FaBolt, FaChartLine, FaCheckCircle, FaGoogle, FaKey, FaShieldAlt } from "react-icons/fa";

import AuthCard from "@/components/AuthCard";
import Button from "@/components/Button";
import Input from "@/components/Input";
import TurnstileWidget from "@/components/TurnstileWidget";
import { useToast } from "@/components/ToastProvider";

const showcaseStats = [
  { label: "Secure Session", value: "JWT" },
  { label: "API Monitoring", value: "24/7" },
  { label: "Fast Access", value: "< 1s" },
];

const showcaseFeatures = [
  {
    title: "Protected dashboard",
    description: "Semua panel account, API key, dan billing hanya bisa diakses setelah login.",
    icon: FaShieldAlt,
  },
  {
    title: "API key management",
    description: "Generate, reveal, revoke, dan monitor API key dari satu tempat.",
    icon: FaKey,
  },
  {
    title: "Usage analytics",
    description: "Pantau request harian, quota tersisa, dan status endpoint real-time.",
    icon: FaChartLine,
  },
];

type CaptchaConfigResponse = {
  enabled: boolean;
  siteKey: string | null;
  configured: boolean;
};

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();

  const [callbackUrl, setCallbackUrl] = useState("/dashboard");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaSiteKey, setCaptchaSiteKey] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);
  const [isCaptchaReady, setIsCaptchaReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callback = params.get("callbackUrl");
    const blocked = params.get("blocked");
    const registered = params.get("registered");
    const error = params.get("error");

    if (callback) {
      setCallbackUrl(callback);
    }

    if (blocked === "1") {
      const message = "Akun kamu sedang diblokir. Hubungi admin untuk informasi ban.";
      setErrorMessage(message);
      toast.error(message, "Account blocked");
      params.delete("blocked");
    }

    if (registered === "1") {
      toast.success("Registrasi berhasil. Silakan login untuk lanjut ke dashboard.", "Register success");
      params.delete("registered");
    }

    if (error) {
      const message =
        error === "AccessDenied"
          ? "Login Google ditolak. Pastikan email Google sudah terverifikasi."
          : "Login Google gagal. Coba lagi beberapa saat.";
      setErrorMessage(message);
      toast.error(message, "Google sign in failed");
      params.delete("error");
    }

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
        toast.warning(message, "Validation");
        return;
      }
    }

    setIsLoading(true);

    const response = await signIn("credentials", {
      email,
      password,
      captchaToken,
      redirect: false,
      callbackUrl,
    });

    setIsLoading(false);

    if (!response || response.error) {
      const message = "Invalid email or password.";
      setErrorMessage(message);
      toast.error(message, "Sign in failed");
      setCaptchaToken(null);
      setCaptchaResetSignal((current) => current + 1);
      return;
    }

    toast.success("Login berhasil. Mengalihkan ke dashboard...", "Welcome back");
    router.push(callbackUrl);
    router.refresh();
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage("");
    setIsGoogleLoading(true);
    await signIn("google", { callbackUrl });
    setIsGoogleLoading(false);
  };

  return (
    <main className="relative isolate min-h-screen overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-zinc-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-800/70" />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="animate-fade-in hidden rounded-3xl border border-zinc-800/80 bg-zinc-950/50 p-7 backdrop-blur-xl lg:block">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <FaBolt className="text-[10px]" />
            Secure Access Layer
          </p>

          <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-zinc-100">
            Sign in to control your API marketplace account
          </h2>
          <p className="mt-3 max-w-xl text-sm text-zinc-400">
            Manage API keys, monitor quota, and track endpoint status with one protected dashboard.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {showcaseStats.map((item) => (
              <article key={item.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <p className="text-lg font-semibold text-zinc-100">{item.value}</p>
                <p className="mt-1 text-xs text-zinc-500">{item.label}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            {showcaseFeatures.map((feature) => {
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
        </section>

        <section className="w-full lg:justify-self-end">
          <div className="mb-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 lg:hidden">
            <p className="text-sm font-medium text-zinc-200">Secure login to your dashboard</p>
            <p className="mt-1 text-xs text-zinc-400">Manage API key, usage analytics, and endpoint status in one place.</p>
          </div>

          <AuthCard
            title="Sign in"
            subtitle="Access your API marketplace dashboard"
            footer={
              <>
                Do not have an account?{" "}
                <Link href="/register" className="font-medium text-zinc-200 transition-colors hover:text-white">
                  Register
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
                onClick={handleGoogleSignIn}
                className="gap-2 border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
              >
                <FaGoogle className="text-sm" />
                Continue with Google
              </Button>

              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span className="h-px flex-1 bg-zinc-700/60" />
                <span>or</span>
                <span className="h-px flex-1 bg-zinc-700/60" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  id="email"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
                <Input
                  id="password"
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="********"
                  autoComplete="current-password"
                  required
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
                  </div>
                ) : null}

                {errorMessage ? (
                  <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {errorMessage}
                  </div>
                ) : null}

                <Button type="submit" fullWidth isLoading={isLoading} loadingText="Signing in...">
                  <span className="inline-flex items-center gap-2">
                    Sign in
                    {!isLoading ? <FaCheckCircle className="text-xs" /> : null}
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
