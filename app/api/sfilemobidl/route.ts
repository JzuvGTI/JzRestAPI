import { handleSfileMobiDownloadRequest } from "@/lib/sfilemobi-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleSfileMobiDownloadRequest(new URL(request.url));
}
