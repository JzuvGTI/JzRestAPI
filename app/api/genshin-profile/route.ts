import { handleGenshinProfileRequest } from "@/lib/genshin-profile-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleGenshinProfileRequest(new URL(request.url));
}
