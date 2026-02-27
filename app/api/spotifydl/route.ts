import { handleSpotifyDownloadRequest } from "@/lib/spotify-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleSpotifyDownloadRequest(new URL(request.url));
}
