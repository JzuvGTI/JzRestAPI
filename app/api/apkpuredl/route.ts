import { handleApkPureDownloadRequest } from "@/lib/apkpure-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleApkPureDownloadRequest(new URL(request.url));
}
