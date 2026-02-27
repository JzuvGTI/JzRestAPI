import { handleStickerlySearchRequest } from "@/lib/stickerly-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleStickerlySearchRequest(new URL(request.url));
}
