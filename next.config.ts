import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseStorage = supabaseUrl ? new URL(supabaseUrl) : null;
const supabaseOrigin = supabaseStorage?.origin;

const securityHeaders = [
  { key: "Content-Security-Policy", value: [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self'",
    `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // React の開発サーバーは開発支援用に eval を使う。本番レスポンスでは
    // 許可しないため、公開時のCSP強度は下げない。
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
    "font-src 'self' data:",
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
  ].join("; ") },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() { return [{ source: "/:path*", headers: securityHeaders }]; },
  images: {
    // LinuxコンテナでローカルSupabaseを使う視覚基準画像の生成時だけ、
    // Docker Desktop の host.docker.internal を許可する。本番では常に false。
    dangerouslyAllowLocalIP: supabaseStorage
      ? ["127.0.0.1", "localhost"].includes(supabaseStorage.hostname) || process.env.E2E_ALLOW_CONTAINER_SUPABASE === "true"
      : false,
    remotePatterns: supabaseStorage ? [{
      protocol: supabaseStorage.protocol.replace(":", "") as "http" | "https",
      hostname: supabaseStorage.hostname,
      port: supabaseStorage.port,
      pathname: "/storage/v1/object/**",
    }] : [],
  },
};

export default nextConfig;
