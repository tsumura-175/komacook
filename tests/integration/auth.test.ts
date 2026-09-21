import { describe, expect, it } from "vitest";
import { createAnonymousTestClient, createAuthenticatedTestClient, TEST_USER_EMAIL, TEST_USER_PASSWORD, testEnvironment } from "../helpers/supabase";

describe("Supabase Auth", () => {
  it("ローカル環境だけをテスト対象にする", () => {
    expect(testEnvironment().url).toMatch(/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/);
  });

  it("ホストされたSupabaseへの統合テスト実行を拒否する", () => {
    const currentUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://production.example.supabase.co";
    try {
      expect(() => testEnvironment()).toThrow("ローカルSupabaseに対してのみ");
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = currentUrl;
    }
  });

  it("確認済みテスト会員でログインし、本人情報を取得できる", async () => {
    const client = createAnonymousTestClient();
    const { data, error } = await client.auth.signInWithPassword({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
    expect(error).toBeNull();
    expect(data.user?.email).toBe(TEST_USER_EMAIL);
    const current = await client.auth.getUser();
    expect(current.error).toBeNull();
    expect(current.data.user?.id).toBe(data.user?.id);
    await client.auth.signOut();
  });

  it("誤ったパスワードを拒否する", async () => {
    const client = createAnonymousTestClient();
    const { data, error } = await client.auth.signInWithPassword({ email: TEST_USER_EMAIL, password: `${TEST_USER_PASSWORD}-wrong` });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it("本人の家族構成と公開設定を更新できる", async () => {
    const { client, user } = await createAuthenticatedTestClient();
    const { data: before, error: readError } = await client.from("profiles").select("family_adults, family_children, show_family").eq("user_id", user.id).single();
    expect(readError).toBeNull();
    try {
      const { error } = await client.from("profiles").update({ family_adults: 1, family_children: 2, show_family: true }).eq("user_id", user.id);
      expect(error).toBeNull();
      const { data } = await client.from("profiles").select("family_adults, family_children, show_family").eq("user_id", user.id).single();
      expect(data).toEqual({ family_adults: 1, family_children: 2, show_family: true });
    } finally {
      await client.from("profiles").update(before ?? { family_adults: null, family_children: null, show_family: false }).eq("user_id", user.id);
      await client.auth.signOut();
    }
  });

  it("ローカルAuthで手動Identity Linkingが有効になっている", async () => {
    const { client } = await createAuthenticatedTestClient();
    const { error } = await client.auth.linkIdentity({ provider: "google", options: { skipBrowserRedirect: true, redirectTo: "http://localhost:3010/auth/callback" } });
    expect(error?.code).not.toBe("manual_linking_disabled");
    await client.auth.signOut();
  });
});
