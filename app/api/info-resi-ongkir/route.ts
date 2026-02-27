import { handleInfoResiOngkirRequest } from "@/lib/info-resi-ongkir-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleInfoResiOngkirRequest(new URL(request.url));
}
