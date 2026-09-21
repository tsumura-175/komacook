import { createClient } from "@supabase/supabase-js";

export const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? "user@komacook.local";
export const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD ?? "Komacook!User2026";

export function testEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !secretKey) throw new Error("ローカルSupabase用のテスト環境変数が不足しています。");
  const hostname = new URL(url).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error("統合テストはローカルSupabaseに対してのみ実行できます。");
  }
  return { url, publishableKey, secretKey };
}

export function createAnonymousTestClient() {
  const { url, publishableKey } = testEnvironment();
  return createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function createAdminTestClient() {
  const { url, secretKey } = testEnvironment();
  return createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function createAuthenticatedTestClient() {
  const client = createAnonymousTestClient();
  const { data, error } = await client.auth.signInWithPassword({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  if (error || !data.user) throw error ?? new Error("テスト会員でログインできませんでした。");
  return { client, user: data.user };
}

