import { z } from "zod";
import { authorize, requireHttps, withRegisterCors } from "@/lib/auth";
import { createSale } from "@/lib/db";

export const runtime = "nodejs";

const saleSchema = z.object({
  transactionId: z.string().trim().min(8).max(100),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(100),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(request: Request) {
  const httpsError = requireHttps(request);
  if (httpsError) return withRegisterCors(httpsError);
  const authError = authorize(request, "pos");
  if (authError) return withRegisterCors(authError);

  try {
    const parsed = saleSchema.safeParse(await request.json());
    if (!parsed.success) {
      return withRegisterCors(
        Response.json(
          { error: "売上データの形式が正しくありません。" },
          { status: 400 },
        ),
      );
    }

    const result = createSale(parsed.data);
    return withRegisterCors(
      Response.json(result, { status: result.duplicated ? 200 : 201 }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "売上を保存できませんでした。";
    return withRegisterCors(
      Response.json({ error: message }, { status: 400 }),
    );
  }
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":
        process.env.REGISTER_ORIGIN?.trim() || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
}
