import { handleDailymotionDownloadRequest } from "@/lib/dailymotion-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleDailymotionDownloadRequest(new URL(request.url));
}
