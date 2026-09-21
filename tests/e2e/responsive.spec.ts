import { expect, test } from "@playwright/test";

test("主要画面をスマートフォン幅で操作できる", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "スマートフォン用メニュー" })).toBeVisible();
  await page.getByRole("link", { name: "探す", exact: true }).click();
  await expect(page.getByRole("button", { name: /絞り込み/ })).toBeVisible();
  await page.getByRole("button", { name: /絞り込み/ }).click();
  await expect(page.getByLabel("カテゴリ")).toBeVisible();
});
