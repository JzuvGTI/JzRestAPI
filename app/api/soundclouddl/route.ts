import { handleSoundCloudDownloadRequest } from "@/lib/soundcloud-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleSoundCloudDownloadRequest(new URL(request.url));
}
