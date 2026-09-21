import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are not configured.");
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    auth: {
      experimental: {
        // Keep independently started PKCE flows from overwriting each other.
        appendPkceFlowIdToRedirects: true,
      },
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot update cookies. The session proxy handles refreshes.
        }
      },
    },
  });
}
