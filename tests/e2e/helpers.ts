import { expect, type Page, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import sharp from "sharp";

export const LOCAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55321";
export const LOCAL_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";
export const LOCAL_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const LOCAL_DATABASE_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:55324";
export const USER_EMAIL = process.env.TEST_USER_EMAIL ?? "user@komacook.local";
export const USER_PASSWORD = process.env.TEST_USER_PASSWORD ?? "Komacook!User2026";
export const ADMIN_EMAIL = "admin@komacook.local";
export const ADMIN_PASSWORD = "Komacook!Admin2026";
export const MAMA_EMAIL = "mama@komacook.local";
export const MAMA_PASSWORD = "Komacook!Mama2026";

function isLocalTestSupabase(url: string) {
  return url.includes("127.0.0.1")
    || url.includes("localhost")
    // LinuxコンテナからWindows/macOSのローカルSupabaseへ接続して、
    // GitHub Actionsと同じLinux向け視覚基準画像を作る場合だけ許可する。
    || (process.env.E2E_ALLOW_CONTAINER_SUPABASE === "true" && url.includes("host.docker.internal"));
}

export function adminClient(): SupabaseClient {
  if (!isLocalTestSupabase(LOCAL_SUPABASE_URL)) {
    throw new Error("E2Eの管理操作はローカルSupabaseでのみ実行できます。");
  }
  if (!LOCAL_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEYが必要です。");
  return createClient(LOCAL_SUPABASE_URL, LOCAL_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function databaseClient() {
  if (!isLocalTestSupabase(LOCAL_DATABASE_URL)) {
    throw new Error("E2EのDB照合はローカルPostgreSQLでのみ実行できます。");
  }
  return postgres(LOCAL_DATABASE_URL, { max: 1, idle_timeout: 1 });
}

export function uniqueValue(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function login(page: Page, email = USER_EMAIL, password = USER_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

export async function createMember(options?: { email?: string; password?: string; displayName?: string; onboarded?: boolean }) {
  const supabase = adminClient();
  const email = options?.email ?? `${uniqueValue("e2e")}@komacook.local`;
  const password = options?.password ?? "E2e!SafePassword2026";
  const displayName = options?.displayName ?? "E2Eテスト会員";
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: displayName } });
  if (error || !data.user) throw error ?? new Error("一時会員を作成できませんでした。");
  if (options?.onboarded !== false) {
    if (!LOCAL_PUBLISHABLE_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEYが必要です。");
    const memberClient = createClient(LOCAL_SUPABASE_URL, LOCAL_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await memberClient.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    const { error: onboardingError } = await memberClient.rpc("complete_onboarding", {
      p_display_name: displayName,
      p_standard_servings: 2,
      p_family_adults: null,
      p_family_children: null,
      p_show_family: false,
      p_avatar_kind: "preset",
      p_preset_avatar_key: "utensils",
      p_avatar_color: "coral",
      p_avatar_path: null,
    });
    await memberClient.auth.signOut();
    if (onboardingError) throw onboardingError;
  }
  return { user: data.user, email, password };
}

export async function removeMember(user: User | string | null | undefined) {
  const id = typeof user === "string" ? user : user?.id;
  if (!id) return;
  const supabase = adminClient();
  await supabase.storage.from("avatars").remove((await supabase.storage.from("avatars").list(id, { limit: 100 })).data?.map((item) => `${id}/${item.name}`) ?? []);
  const recipeFolders = (await supabase.storage.from("recipe-images").list(id, { limit: 100 })).data ?? [];
  for (const folder of recipeFolders) {
    const nested = (await supabase.storage.from("recipe-images").list(`${id}/${folder.name}`, { limit: 100 })).data ?? [];
    await supabase.storage.from("recipe-images").remove(nested.map((item) => `${id}/${folder.name}/${item.name}`));
  }
  await supabase.auth.admin.deleteUser(id);
}

export function attachLocalGoogleIdentity(userId: string, email: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("テスト会員IDが不正です。");
  const safeEmail = email.replaceAll("'", "''");
  const providerId = `google-${userId}`;
  const sql = `
    insert into auth.identities (provider_id, user_id, identity_data, provider, id, created_at, updated_at)
    values ('${providerId}', '${userId}', jsonb_build_object('sub', '${providerId}', 'email', '${safeEmail}', 'email_verified', true), 'google', gen_random_uuid(), now(), now());
    update auth.users
    set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{providers}', '["email","google"]'::jsonb, true)
    where id = '${userId}';
  `;
  execFileSync("docker", ["exec", "-i", "supabase_db_komacook", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "pipe" });
}

export async function createImage(testInfo: TestInfo, name: string, color: { r: number; g: number; b: number }, width = 900, height = 600) {
  const path = testInfo.outputPath(`${name}.png`);
  await sharp({ create: { width, height, channels: 3, background: color } }).png().toFile(path);
  return path;
}

type MailpitAddress = { Address?: string; address?: string };
type MailpitSummary = { ID: string; Subject: string; To?: MailpitAddress[] };
type MailpitList = { messages?: MailpitSummary[] };
type MailpitMessage = { HTML?: string; Text?: string; Subject?: string };

export async function clearMailpit() {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
}

export async function waitForMail(recipient: string, subjectPart: string, timeoutMs = 20_000): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    if (response.ok) {
      const list = await response.json() as MailpitList;
      const summary = list.messages?.find((message) =>
        message.Subject.includes(subjectPart) && message.To?.some((address) => (address.Address ?? address.address) === recipient),
      );
      if (summary) {
        const detail = await fetch(`${MAILPIT_URL}/api/v1/message/${summary.ID}`);
        if (detail.ok) return await detail.json() as MailpitMessage;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${recipient}宛ての「${subjectPart}」メールがMailpitに届きませんでした。`);
}

export function firstAppLink(message: MailpitMessage, includes: string) {
  const source = `${message.HTML ?? ""}\n${message.Text ?? ""}`.replaceAll("&amp;", "&");
  const links = source.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const link = links.find((value) => value.includes(includes));
  if (!link) throw new Error(`メールから${includes}を含むリンクを取得できませんでした。`);
  return link.replace(/[).,]+$/, "");
}
