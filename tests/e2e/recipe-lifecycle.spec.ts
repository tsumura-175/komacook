import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { adminClient, createImage, createMember, login, removeMember, uniqueValue } from "./helpers";

async function fillRequiredRecipe(page: Page, title: string) {
  await page.locator('input[name="title"]').fill(title);
  await page.locator('select[name="category"]').selectOption({ index: 1 });
  const ingredient = page.locator(".ingredient-form-row").first();
  await ingredient.getByLabel("材料名").fill("テスト材料");
  await ingredient.getByLabel("分量").fill("100");
  await ingredient.getByLabel("単位").fill("g");
  await page.locator(".step-form-row textarea").first().fill("材料を混ぜて加熱する");
}

test.describe("レシピのライフサイクル", () => {
  test("下書きを自動保存し、別タブ更新との競合を検知する", async ({ page, context }) => {
    test.setTimeout(70_000);
    const member = await createMember({ displayName: "下書き競合テスト会員" });
    const title = uniqueValue("自動保存レシピ");
    const admin = adminClient();
    try {
      await login(page, member.email, member.password);
      await page.goto("/recipes/new");
      await fillRequiredRecipe(page, title);
      await expect(page.getByText("未保存の変更があります")).toBeVisible();
      await expect.poll(async () => {
        const result = await admin.from("recipes").select("id,status,lock_version").eq("owner_user_id", member.user.id).eq("title", title).maybeSingle();
        return result.data;
      }, { timeout: 40_000 }).toMatchObject({ status: "draft" });
      const created = await admin.from("recipes").select("id,lock_version").eq("owner_user_id", member.user.id).eq("title", title).single();
      const recipeId = created.data!.id;

      const secondPage = await context.newPage();
      await secondPage.goto(`/recipes/${recipeId}/edit`);
      await expect(secondPage.locator('input[name="title"]')).toHaveValue(title);
      await page.goto(`/recipes/${recipeId}/edit`);
      await page.locator('textarea[name="description"]').fill("先に保存した内容");
      await page.getByRole("button", { name: "今すぐ下書き保存" }).click();
      await expect(page.getByText(/保存済み/)).toBeVisible();

      await secondPage.locator('textarea[name="description"]').fill("古い画面からの更新");
      await secondPage.getByRole("button", { name: "今すぐ下書き保存" }).click();
      await expect(secondPage.getByRole("alertdialog", { name: "別の画面で更新されています" })).toBeVisible();
      const persisted = await admin.from("recipes").select("description").eq("id", recipeId).single();
      expect(persisted.data?.description).toBe("先に保存した内容");
      await secondPage.close();
    } finally {
      await removeMember(member.user);
    }
  });

  test("完成画像付きレシピを公開・非公開化し、画像差し替え・削除・ゴミ箱・復元まで行える", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const member = await createMember({ displayName: "レシピ画像テスト会員" });
    const title = uniqueValue("画像付き公開レシピ");
    const firstImage = await createImage(testInfo, "recipe-first", { r: 230, g: 150, b: 40 }, 1400, 900);
    const stepImage = await createImage(testInfo, "recipe-step", { r: 100, g: 170, b: 120 }, 700, 1200);
    const secondImage = await createImage(testInfo, "recipe-second", { r: 70, g: 140, b: 220 }, 800, 1200);
    const admin = adminClient();
    try {
      await login(page, member.email, member.password);
      await page.goto("/recipes/new");
      await fillRequiredRecipe(page, title);
      await page.getByText("公開", { exact: true }).click();
      await page.locator('.step-image-editor input[type="file"]').first().setInputFiles(stepImage);
      await expect(page.getByRole("img", { name: "工程写真のプレビュー" })).toBeVisible();
      await page.locator('.recipe-image-editor input[type="file"]').setInputFiles(firstImage);
      await expect(page.getByRole("img", { name: "完成写真の切り抜きプレビュー" })).toBeVisible();
      await page.getByLabel("拡大").last().fill("1.2");
      expect(await page.locator("form").evaluate((form) => [...form.querySelectorAll(":invalid")].map((element) => ({ name: (element as HTMLInputElement).name, type: (element as HTMLInputElement).type, validationMessage: (element as HTMLInputElement).validationMessage })))).toEqual([]);
      await page.getByRole("button", { name: "入力内容を確認" }).click();
      await expect(page.getByRole("dialog", { name: "保存内容を確認" })).toBeVisible();
      await page.getByRole("button", { name: "この内容で登録" }).click();
      await expect(page.getByRole("heading", { name: "レシピを保存しました" })).toBeVisible();

      const created = await admin.from("recipes").select("id,status,visibility,image_path").eq("owner_user_id", member.user.id).eq("title", title).single();
      expect(created.data).toMatchObject({ status: "published", visibility: "public" });
      const recipeId = created.data!.id;
      const firstPath = created.data!.image_path as string;
      const persistedStep = await admin.from("recipe_steps").select("image_path").eq("recipe_id", recipeId).eq("sort_order", 1).single();
      expect(persistedStep.data?.image_path).toMatch(/\/steps\/.+\.webp$/);
      const stepDownload = await admin.storage.from("recipe-images").download(persistedStep.data!.image_path!);
      const stepMetadata = await sharp(Buffer.from(await stepDownload.data!.arrayBuffer())).metadata();
      expect(stepMetadata).toMatchObject({ format: "webp", width: 960, height: 720 });
      const firstDownload = await admin.storage.from("recipe-images").download(firstPath);
      expect(firstDownload.error).toBeNull();
      const firstMetadata = await sharp(Buffer.from(await firstDownload.data!.arrayBuffer())).metadata();
      expect(firstMetadata).toMatchObject({ format: "webp", width: 1200, height: 750 });

      await page.goto(`/recipes/${recipeId}`);
      await expect(page.getByRole("img", { name: "1番目の工程写真" })).toBeVisible();
      await page.goto(`/recipes/${recipeId}/edit`);
      await page.getByText("非公開", { exact: true }).click();
      await page.locator(".recipe-image-editor").getByRole("button", { name: "写真を変更" }).click();
      await page.locator('.recipe-image-editor input[type="file"]').setInputFiles(secondImage);
      await page.getByRole("button", { name: "変更内容を確認" }).click();
      await page.getByRole("button", { name: "変更を保存" }).click();
      await expect(page.getByRole("heading", { name: "レシピを保存しました" })).toBeVisible();
      const replaced = await admin.from("recipes").select("visibility,image_path").eq("id", recipeId).single();
      expect(replaced.data?.visibility).toBe("private");
      expect(replaced.data?.image_path).not.toBe(firstPath);
      expect((await admin.storage.from("recipe-images").download(firstPath)).error).toBeTruthy();
      const secondPath = replaced.data!.image_path as string;

      await page.goto(`/recipes/${recipeId}/edit`);
      await page.locator(".recipe-image-editor").getByRole("button", { name: "写真を削除" }).click();
      await expect(page.getByRole("status")).toContainText("保存すると現在の完成写真を削除します");
      await page.getByRole("button", { name: "変更内容を確認" }).click();
      await page.getByRole("button", { name: "変更を保存" }).click();
      await expect.poll(async () => (await admin.from("recipes").select("image_path").eq("id", recipeId).single()).data?.image_path).toBeNull();
      expect((await admin.storage.from("recipe-images").download(secondPath)).error).toBeTruthy();

      await page.goto(`/recipes/${recipeId}/edit`);
      await page.getByRole("button", { name: "ゴミ箱に移す" }).click();
      await page.getByRole("button", { name: "ゴミ箱へ移す" }).click();
      await expect(page).toHaveURL(/\/mypage\/recipes\?tab=trash/);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      await page.getByRole("button", { name: "元に戻す" }).click();
      await expect.poll(async () => (await admin.from("recipes").select("status,visibility").eq("id", recipeId).single()).data).toMatchObject({ status: "published", visibility: "private" });
    } finally {
      await removeMember(member.user);
    }
  });
});
