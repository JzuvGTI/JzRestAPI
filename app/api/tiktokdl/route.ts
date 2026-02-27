import { handleTikTokDownloadRequest } from "@/lib/tiktok-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleTikTokDownloadRequest(new URL(request.url));
}
