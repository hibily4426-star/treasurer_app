import { connection } from "next/server";
import { listProducts } from "@/lib/db";
import { RegisterApp } from "@/app/register-app";

export const runtime = "nodejs";

export default async function Home() {
  await connection();
  return <RegisterApp products={listProducts()} />;
}
