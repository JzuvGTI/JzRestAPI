import { NextResponse } from "next/server";

import { getCaptchaConfig } from "@/lib/turnstile";

export const runtime = "nodejs";

export async function GET() {
  const captchaConfig = await getCaptchaConfig();

  return NextResponse.json(
    {
      enabled: captchaConfig.enabled,
      siteKey: captchaConfig.siteKey,
      configured: Boolean(captchaConfig.siteKey),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
