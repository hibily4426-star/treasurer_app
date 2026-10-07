import { authorize, requireHttps } from "@/lib/auth";
import { getDashboard } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const httpsError = requireHttps(request);
  if (httpsError) return httpsError;
  const authError = authorize(request, "admin");
  if (authError) return authError;

  return Response.json(getDashboard(), {
    headers: { "Cache-Control": "no-store" },
  });
}
