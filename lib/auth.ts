import { createHash, timingSafeEqual } from "node:crypto";

type AuthKind = "pos" | "admin";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function secureEqual(left: string, right: string) {
  return timingSafeEqual(digest(left), digest(right));
}

function readCredential(request: Request, kind: AuthKind) {
  const directHeader =
    kind === "admin"
      ? request.headers.get("x-admin-key")
      : request.headers.get("x-api-key");
  if (directHeader) return directHeader.trim();

  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return "";
}

export function authorize(request: Request, kind: AuthKind) {
  const envName = kind === "admin" ? "ADMIN_API_KEY" : "POS_API_KEY";
  const expected = process.env[envName]?.trim();

  if (!expected) {
    return Response.json(
      { error: `${envName} が設定されていません。` },
      { status: 503 },
    );
  }

  if (!secureEqual(readCredential(request, kind), expected)) {
    return Response.json(
      { error: kind === "admin" ? "管理者キーが正しくありません。" : "API キーが正しくありません。" },
      { status: 401 },
    );
  }

  return null;
}

export function requireHttps(request: Request) {
  const hostname = new URL(request.url).hostname;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  if (process.env.NODE_ENV !== "production" || isLocalhost) return null;

  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  const protocol =
    forwardedProtocol ?? new URL(request.url).protocol.replace(":", "");

  if (protocol !== "https") {
    return Response.json(
      { error: "HTTPS 接続が必要です。" },
      { status: 426, headers: { Upgrade: "TLS/1.2" } },
    );
  }

  return null;
}

export function withRegisterCors(response: Response) {
  const headers = new Headers(response.headers);
  headers.set(
    "Access-Control-Allow-Origin",
    process.env.REGISTER_ORIGIN?.trim() || "*",
  );
  headers.set("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
