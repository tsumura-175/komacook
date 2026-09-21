import { expect, test } from "@playwright/test";
import { adminClient, attachLocalGoogleIdentity, createImage, createMember, login, removeMember } from "./helpers";

test.describe("プロフィールとアカウント設定", () => {
  test("プロフィール画像を登録・差し替え・プリセットへ戻し、家族構成を保存できる", async ({ page }, testInfo) => {
    const member = await createMember({ displayName: "プロフィールテスト会員" });
    const firstImage = await createImage(testInfo, "avatar-first", { r: 40, g: 120, b: 210 });
    const secondImage = await createImage(testInfo, "avatar-second", { r: 60, g: 170, b: 90 });
    const admin = adminClient();
    try {
      await login(page, member.email, member.password);
      await page.goto("/settings/profile");
      await page.locator('input[type="file"]').setInputFiles(firstImage);
      await page.getByLabel("表示名").fill("画像変更済み会員");
      await page.getByLabel("大人").fill("2");
      await page.getByLabel("子ども").fill("1");
      await page.getByText("公開", { exact: true }).click();
      await page.getByRole("button", { name: "変更を保存" }).click();
      await expect(page.getByRole("status")).toContainText("変更を保存しました");
      const first = await admin.from("profiles").select("avatar_kind,avatar_path,display_name,family_adults,family_children,show_family").eq("user_id", member.user.id).single();
      expect(first.data).toMatchObject({ avatar_kind: "upload", display_name: "画像変更済み会員", family_adults: 2, family_children: 1, show_family: true });
      const firstPath = first.data!.avatar_path as string;

      await page.goto("/settings/profile");
      await page.locator('input[type="file"]').setInputFiles(secondImage);
      await expect(page.locator('input[type="file"]')).toHaveValue(/avatar-second\.png$/);
      await page.getByRole("button", { name: "変更を保存" }).click();
      await expect(page).toHaveURL(/message=saved/);
      await expect(page.getByRole("status")).toContainText("変更を保存しました");
      const second = await admin.from("profiles").select("avatar_path").eq("user_id", member.user.id).single();
      expect(second.data?.avatar_path).not.toBe(firstPath);
      expect((await admin.storage.from("avatars").download(firstPath)).error).toBeTruthy();

      await page.goto("/settings/profile");
      await page.getByRole("button", { name: "用意されたアイコンを使う" }).click();
      await page.getByRole("button", { name: "にんじん" }).click();
      await page.getByRole("button", { name: "leaf色" }).click();
      await page.getByRole("button", { name: "変更を保存" }).click();
      await expect(page).toHaveURL(/message=saved/);
      const preset = await admin.from("profiles").select("avatar_kind,avatar_path,preset_avatar_key,avatar_color").eq("user_id", member.user.id).single();
      expect(preset.data).toMatchObject({ avatar_kind: "preset", avatar_path: null, preset_avatar_key: "carrot", avatar_color: "leaf" });
      expect((await admin.storage.from("avatars").download(second.data!.avatar_path)).error).toBeTruthy();
    } finally {
      await removeMember(member.user);
    }
  });

  test("重要操作で確認入力と現在のパスワードによる再認証を要求する", async ({ page }) => {
    const member = await createMember({ displayName: "再認証テスト会員" });
    try {
      await login(page, member.email, member.password);
      await page.goto("/settings/account");
      await page.waitForLoadState("networkidle");
      const passwordForms = page.locator("form.settings-security-form");
      const changePasswordForm = passwordForms.filter({ hasText: "パスワード変更" });
      await changePasswordForm.getByLabel("現在のパスワード").fill("incorrect-password");
      await changePasswordForm.locator("#settings-new-password").fill("Changed!SafePassword2027");
      await changePasswordForm.locator("#settings-new-password-confirmation").fill("Changed!SafePassword2027");
      await expect.poll(() => changePasswordForm.locator("#settings-new-password").evaluate((input) => (input as HTMLInputElement).validationMessage)).toBe("");
      expect(await changePasswordForm.evaluate((form) => (form as HTMLFormElement).checkValidity())).toBe(true);
      await changePasswordForm.getByRole("button", { name: "パスワードを変更" }).click();
      await expect(page).toHaveURL(/error=reauthentication/);
      await expect(page.locator(".auth-error")).toContainText("現在のパスワードを確認できませんでした");

      await page.goto("/settings/connections");
      await expect(page.getByRole("button", { name: "Googleを連携" })).toBeVisible();
      await page.getByRole("button", { name: "Googleを連携" }).click();
      await expect(page).toHaveURL(/\/settings\/connections\?error=google-link/);
      await expect(page.locator(".auth-error")).toContainText("Google連携を開始できませんでした");
    } finally {
      await removeMember(member.user);
    }
  });

  test("メール認証を残したままGoogle連携を再認証付きで解除できる", async ({ page }) => {
    const member = await createMember({ displayName: "Google解除テスト会員" });
    attachLocalGoogleIdentity(member.user.id, member.email);
    try {
      await login(page, member.email, member.password);
      await page.goto("/settings/connections");
      await expect(page.locator(".connection-card-google")).toContainText("連携済み");
      await page.getByLabel("現在のパスワードで再認証").fill(member.password);
      await page.getByLabel(/確認のため/).fill("Google連携を解除");
      await page.getByRole("button", { name: "Google連携を解除" }).click();
      await expect(page.getByRole("status")).toContainText("Google連携を解除しました");
      const user = await adminClient().auth.admin.getUserById(member.user.id);
      expect(user.data.user?.identities?.some((identity) => identity.provider === "google")).toBe(false);
      expect(user.data.user?.identities?.some((identity) => identity.provider === "email")).toBe(true);
    } finally {
      await removeMember(member.user);
    }
  });
});
