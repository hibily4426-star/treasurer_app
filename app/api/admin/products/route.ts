import { z } from "zod";
import { authorize, requireHttps } from "@/lib/auth";
import { addProduct } from "@/lib/db";

export const runtime = "nodejs";

const productSchema = z.object({
  name: z.string().trim().min(1).max(50),
  shortName: z.string().trim().min(1).max(10),
  category: z.string().trim().min(1).max(30),
  price: z.number().int().min(0).max(100000),
});

export async function POST(request: Request) {
  const httpsError = requireHttps(request);
  if (httpsError) return httpsError;
  const authError = authorize(request, "admin");
  if (authError) return authError;

  const parsed = productSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "商品名・略称・カテゴリー・価格を正しく入力してください。" },
      { status: 400 },
    );
  }

  return Response.json(addProduct(parsed.data), { status: 201 });
}