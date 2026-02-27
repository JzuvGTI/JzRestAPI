import { handleTriCheckRequest } from "@/lib/tri-check-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleTriCheckRequest(new URL(request.url));
}
