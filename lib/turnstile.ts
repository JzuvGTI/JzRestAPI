import { getSystemSettings } from "@/lib/system-settings";

type CaptchaConfig = {
  enabled: boolean;
  siteKey: string | null;
  secretKey: string | null;
};

type CaptchaVerifyResult =
  | { ok: true }
  | { ok: false; error: string; errorCodes?: string[] };

function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return null;
}

export async function getCaptchaConfig(): Promise<CaptchaConfig> {
  const settings = await getSystemSettings({ force: true });
  const enabled = Boolean(settings.AUTH_CAPTCHA_ENABLED);
  const siteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim() || null;
  const secretKey = (process.env.TURNSTILE_SECRET_KEY || "").trim() || null;

  return {
    enabled,
    siteKey,
    secretKey,
  };
}

export async function verifyCaptchaToken(
  request: Request,
  token: string | null | undefined,
): Promise<CaptchaVerifyResult> {
  const config = await getCaptchaConfig();
  if (!config.enabled) {
    return { ok: true };
  }

  const normalizedToken = token?.trim() || "";
  if (!normalizedToken) {
    return {
      ok: false,
      error: "Captcha token is required.",
    };
  }

  if (!config.secretKey) {
    return {
      ok: false,
      error: "Captcha is not configured on server.",
    };
  }

  const payload = new URLSearchParams();
  payload.set("secret", config.secretKey);
  payload.set("response", normalizedToken);

  const ipAddress = getRequestIp(request);
  if (ipAddress) {
    payload.set("remoteip", ipAddress);
  }

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload.toString(),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        error: "Captcha verification failed.",
      };
    }

    const result = (await response.json()) as {
      success?: boolean;
      ["error-codes"]?: string[];
    };
    if (!result.success) {
      return {
        ok: false,
        error: "Captcha verification failed.",
        errorCodes: result["error-codes"] || [],
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Captcha verification failed.",
    };
  }
}
