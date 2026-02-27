import { handleInfoLokerRequest } from "@/lib/info-loker-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleInfoLokerRequest(new URL(request.url));
}
