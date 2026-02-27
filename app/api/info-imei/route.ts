import { handleInfoImeiRequest } from "@/lib/info-imei-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleInfoImeiRequest(new URL(request.url));
}
