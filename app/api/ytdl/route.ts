import { handleYoutubeDownloadRequest } from "@/lib/youtube-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleYoutubeDownloadRequest(new URL(request.url));
}
