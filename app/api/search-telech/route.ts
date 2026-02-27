import { handleSearchTelechRequest } from "@/lib/search-telech-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleSearchTelechRequest(new URL(request.url));
}
