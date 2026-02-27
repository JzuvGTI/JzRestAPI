import { handleTempMailRequest } from "@/lib/temp-mail-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleTempMailRequest(new URL(request.url));
}
