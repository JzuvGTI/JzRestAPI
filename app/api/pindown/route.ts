import { handlePindownRequest } from "@/lib/pindown-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handlePindownRequest(new URL(request.url));
}
