import { handleSmuleDownloadRequest } from "@/lib/smule-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleSmuleDownloadRequest(new URL(request.url));
}
