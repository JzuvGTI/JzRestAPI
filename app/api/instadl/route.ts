import { handleInstaDownloadRequest } from "@/lib/instadl-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleInstaDownloadRequest(new URL(request.url));
}
