import { handleCountryTimeRequest } from "@/lib/country-time-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleCountryTimeRequest(new URL(request.url));
}
