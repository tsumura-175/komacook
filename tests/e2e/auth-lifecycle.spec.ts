import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { adminClient, clearMailpit, createImage, createMember, firstAppLink, login, removeMember, uniqueValue, waitForMail } from "./helpers";

test.describe("認証ライフサイクル", () => {
  test("新規登録メールを確認し、プロフィール画像付きで初回設定を完了できる", async ({ page }, testInfo) => {
    const email = `${uniqueValue("signup")}@komacook.local`;
    const password = "Signup!SafePassword2026";
    const avatar = await createImage(testInfo, "signup-avatar", { r: 228, g: 92, b: 74 }, 700, 900);
    let userId: string | undefined;
    await clearMailpit();
    try {
      await page.goto("/login");
      await page.getByRole("tab", { name: "新規登録" }).click();
      await page.locator("#signup-email").fill(email);
      await page.locator("#signup-password").fill(password);
      await page.locator("#signup-password-confirmation").fill(password);
      await page.getByRole("button", { name: "無料で会員登録する" }).click();
      await expect(page.getByRole("heading", { name: "確認メールをご確認ください" })).toBeVisible();

      const message = await waitForMail(email, "");
      await page.goto(firstAppLink(message, "/auth/v1/verify"));
      await expect(page).toHaveURL(/\/onboarding/);
      await page.getByLabel(/表示名/).fill("登録画像テスト会員");
      await page.getByLabel(/標準の調理人数/).fill("4");
      await page.getByRole("button", { name: "次へ進む" }).click();
      await page.locator('input[type="file"]').setInputFiles(avatar);
      await expect(page.getByLabel("拡大")).toBeVisible();
      await page.getByLabel("拡大").fill("1.25");
      await page.getByRole("button", { name: "次へ進む" }).click();
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "設定を完了する" }).click();
      await expect(page).toHaveURL(/\/$/);

      const admin = adminClient();
      const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const user = users.data.users.find((item) => item.email === email);
      expect(user).toBeTruthy();
      userId = user?.id;
      const { data: profile, error } = await admin.from("profiles").select("display_name,standard_servings,avatar_kind,avatar_path,onboarding_completed").eq("user_id", userId!).single();
      expect(error).toBeNull();
      expect(profile).not.toBeNull();
      expect(profile).toMatchObject({ display_name: "登録画像テスト会員", standard_servings: 4, avatar_kind: "upload", onboarding_completed: true });
      expect(profile!.avatar_path).toBeTruthy();
      const downloaded = await admin.storage.from("avatars").download(profile!.avatar_path);
      expect(downloaded.error).toBeNull();
      const metadata = await sharp(Buffer.from(await downloaded.data!.arrayBuffer())).metadata();
      expect(metadata).toMatchObject({ format: "webp", width: 512, height: 512 });
    } finally {
      await removeMember(userId);
    }
  });

  test("再設定メールからパスワードを変更し、新しいパスワードでログインできる", async ({ page }) => {
    const member = await createMember({ displayName: "再設定テスト会員" });
    const newPassword = "Reset!SafePassword2027";
    await clearMailpit();
    try {
      await page.goto("/forgot-password");
      await page.getByLabel("登録したメールアドレス").fill(member.email);
      await page.getByRole("button", { name: "再設定メールを送る" }).click();
      await expect(page.getByRole("status")).toContainText("再設定メール");
      const message = await waitForMail(member.email, "");
      await page.goto(firstAppLink(message, "/auth/v1/verify"));
      await expect(page).toHaveURL(/\/reset-password/);
      await page.waitForLoadState("networkidle");
      await page.locator("#new-password").fill(newPassword);
      await page.locator("#new-password-confirmation").fill(newPassword);
      await expect.poll(() => page.locator("#new-password").evaluate((input) => (input as HTMLInputElement).validationMessage)).toBe("");
      expect(await page.locator("form.auth-form").evaluate((form) => Array.from((form as HTMLFormElement).elements)
        .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement && !element.checkValidity())
        .map((element) => ({ id: element.id, message: element.validationMessage, value: element.value })))).toEqual([]);
      await page.getByRole("button", { name: "パスワードを変更する" }).click();
      await expect(page).toHaveURL(/\/login\?message=password-updated/);
      await login(page, member.email, newPassword);
      await expect(page).toHaveURL(/\/$/);
    } finally {
      await removeMember(member.user);
    }
  });
});
