import { handleSpotifySearchRequest } from "@/lib/spotify-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleSpotifySearchRequest(new URL(request.url));
}
