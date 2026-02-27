import { handleKodeposCheckRequest } from "@/lib/kodepos-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleKodeposCheckRequest(new URL(request.url));
}
