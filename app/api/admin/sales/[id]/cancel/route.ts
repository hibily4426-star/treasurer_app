import { z } from "zod";
import { authorize, requireHttps } from "@/lib/auth";
import { cancelSale } from "@/lib/db";

export const runtime = "nodejs";

const cancellationSchema = z.object({
  reason: z.string().trim().min(2).max(200),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const httpsError = requireHttps(request);
  if (httpsError) return httpsError;
  const authError = authorize(request, "admin");
  if (authError) return authError;

  const parsed = cancellationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "取消理由を2文字以上で入力してください。" },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const result = cancelSale(id, parsed.data.reason);
  if (result.status === "not_found") {
    return Response.json({ error: "売上が見つかりません。" }, { status: 404 });
  }
  if (result.status === "already_cancelled") {
    return Response.json(
      { error: "この売上はすでに取り消されています。" },
      { status: 409 },
    );
  }

  return Response.json({ success: true, cancelled: 1 });
}
