import { authorize, requireHttps } from "@/lib/auth";
import { deactivateProduct } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const httpsError = requireHttps(request);
  if (httpsError) return httpsError;
  const authError = authorize(request, "admin");
  if (authError) return authError;

  const { id } = await context.params;
  if (!deactivateProduct(id)) {
    return Response.json({ error: "商品が見つかりません。" }, { status: 404 });
  }
  return Response.json({ success: true });
}