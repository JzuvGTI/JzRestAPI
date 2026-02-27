import { handleInfoKrlRequest } from "@/lib/info-krl-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleInfoKrlRequest(new URL(request.url));
}
