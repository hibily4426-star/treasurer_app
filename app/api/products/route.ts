import { listProducts } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(
    { products: listProducts() },
    { headers: { "Cache-Control": "no-store" } },
  );
}