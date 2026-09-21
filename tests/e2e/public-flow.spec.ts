import { expect, test } from "@playwright/test";

test("公開レシピをDB検索して詳細と共有方法を確認できる", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("いつもの味を");

  await page.getByLabel("レシピを検索").fill("鶏");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\?q=%E9%B6%8F/);
  await expect(page.getByRole("heading", { name: "「鶏」の検索結果" })).toBeVisible();
  await expect(page.getByText("1件見つかりました")).toBeVisible();

  await page.getByRole("link", { name: "鶏の照り焼き", exact: true }).click();
  await expect(page.getByRole("heading", { name: "鶏の照り焼き", level: 1 })).toBeVisible();
  await expect(page.getByText("1人分 390kcal")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "共有メニュー" }).click();
  await expect(page.getByRole("button", { name: "端末から共有" })).toBeVisible();
  await expect(page.getByRole("link", { name: "LINEで共有" })).toHaveAttribute("href", /lineit\/share\?url=/);
  await expect(page.getByRole("button", { name: "リンクをコピー" })).toBeVisible();
});

test("メール会員がログインしてマイページを表示できる", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(process.env.TEST_USER_EMAIL ?? "user@komacook.local");
  await page.getByLabel("パスワード", { exact: true }).fill(process.env.TEST_USER_PASSWORD ?? "Komacook!User2026");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/mypage");
  await expect(page.getByRole("heading", { name: "マイページ" })).toBeVisible();
});
