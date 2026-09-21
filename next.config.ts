import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseStorage = supabaseUrl ? new URL(supabaseUrl) : null;

const nextConfig: NextConfig = {
  images: {
    dangerouslyAllowLocalIP: supabaseStorage ? ["127.0.0.1", "localhost"].includes(supabaseStorage.hostname) : false,
    remotePatterns: supabaseStorage ? [{
      protocol: supabaseStorage.protocol.replace(":", "") as "http" | "https",
      hostname: supabaseStorage.hostname,
      port: supabaseStorage.port,
      pathname: "/storage/v1/object/**",
    }] : [],
  },
};

export default nextConfig;
