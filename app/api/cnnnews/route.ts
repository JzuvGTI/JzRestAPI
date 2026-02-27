import { handleCnnNewsRequest } from "@/lib/cnnnews-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleCnnNewsRequest(new URL(request.url));
}
