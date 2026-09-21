import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { adminClient, databaseClient, login } from "./helpers";

const recipeId = "20000000-0000-0000-0000-000000000002";
const ownerUserId = "00000000-0000-0000-0000-000000000003";
const visualImagePath = `${ownerUserId}/visual-regression/finished.webp`;
const viewports = [
  { name: "320", width: 320, height: 720 }, { name: "375", width: 375, height: 812 },
  { name: "390", width: 390, height: 844 }, { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 }, { name: "1280", width: 1280, height: 900 },
  { name: "1440", width: 1440, height: 960 },
] as const;

async function settle(page: Page) {
  await page.locator("main").waitFor({ state: "visible" });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(150);
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });

test.describe("表示幅ごとのホーム画面", () => {
  for (const viewport of viewports) {
    test(`${viewport.name}pxでホームのレイアウトが崩れない`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await settle(page);
      await expectNoHorizontalOverflow(page);
      await expect(page).toHaveScreenshot(`home-${viewport.name}.png`, { fullPage: true });
    });
  }
});

test("データ0件・画像あり／なし・長い文字列を比較する", async ({ page }) => {
  const supabase = adminClient();
  const database = databaseClient();
  const [{ data: recipe }, { data: profile }] = await Promise.all([
    supabase.from("recipes").select("title, description, image_path").eq("id", recipeId).single(),
    supabase.from("profiles").select("display_name").eq("user_id", ownerUserId).single(),
  ]);
  if (!recipe || !profile) throw new Error("視覚回帰テスト用のダミーデータがありません。");

  try {
    const image = await sharp({ create: { width: 1200, height: 750, channels: 3, background: { r: 216, g: 112, b: 72 } } }).webp({ quality: 80 }).toBuffer();
    const upload = await supabase.storage.from("recipe-images").upload(visualImagePath, image, { contentType: "image/webp", upsert: true });
    if (upload.error) throw upload.error;
    await database`update public.recipes set title = ${"香り豊かな旬の野菜と鶏肉をたっぷり使った、家族みんなで何度でも作りたくなる特製照り焼き"}, description = ${"長い説明文でもカードと詳細画面の余白・改行・操作ボタンが重ならないことを確認するための視覚回帰テスト用データです。"}, image_path = ${visualImagePath} where id = ${recipeId}`;
    // profiles.display_name は本番スキーマで30文字まで。許容範囲の上限に近い値で検証する。
    await database`update public.profiles set display_name = ${"とても長い表示名でもレイアウトを崩さず読める投稿者テスト"} where user_id = ${ownerUserId}`;

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/recipes/${recipeId}`);
    await settle(page);
    await expect(page.getByRole("img", { name: /完成写真$/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(page).toHaveScreenshot("recipe-long-content-with-image.png", { fullPage: true });

    await database`update public.recipes set image_path = null where id = ${recipeId}`;
    await page.reload();
    await settle(page);
    await expect(page.getByText("写真なし")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(page).toHaveScreenshot("recipe-long-content-no-image.png", { fullPage: true });

    await page.goto("/recipes?q=visual-regression-no-results");
    await settle(page);
    await expect(page.getByRole("heading", { name: "条件に合うレシピがありません" })).toBeVisible();
    await expect(page.locator(".search-page-main")).toHaveScreenshot("search-empty.png");
  } finally {
    await Promise.all([
      database`update public.recipes set title = ${recipe.title}, description = ${recipe.description}, image_path = ${recipe.image_path} where id = ${recipeId}`,
      database`update public.profiles set display_name = ${profile.display_name} where user_id = ${ownerUserId}`,
      supabase.storage.from("recipe-images").remove([visualImagePath]),
    ]);
    await database.end();
  }
});

test("読み込み中の表示を比較する", async ({ page }) => {
  await login(page);
  await page.route("**/rest/v1/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await route.abort("failed");
  });
  await page.goto("/mypage/recipes");
  await expect(page.getByText("マイレシピを読み込んでいます")).toBeVisible();
  await settle(page);
  await expect(page.locator(".my-recipes-main")).toHaveScreenshot("my-recipes-loading.png");
});

test("通信失敗の表示を比較する", async ({ page }) => {
  await login(page);
  // 認証確認を失敗させ、データ取得前のネットワーク障害時の利用者向け表示を検証する。
  await page.route("**/auth/v1/user", (route) => route.abort("failed"));
  await page.goto("/mypage/recipes");
  await expect(page.locator(".my-recipes-main .auth-error[role=alert]")).toContainText("ログイン状態を確認できませんでした", { timeout: 5_000 });
  await expect(page.locator(".my-recipes-main")).toHaveScreenshot("my-recipes-network-error.png");
});

test("入力エラー・モーダル・キーボード操作を比較する", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/recipes/${recipeId}`);
  await settle(page);
  await page.getByRole("button", { name: "このレシピを通報する" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".modal-backdrop")).toHaveScreenshot("report-modal.png");
  await page.locator(".report-dialog form").evaluate((form) => { (form as HTMLFormElement).noValidate = true; });
  await page.getByRole("button", { name: "通報を送信" }).click();
  await expect(page.locator(".report-dialog .auth-error[role=alert]")).toContainText("通報理由を選択してください。");
  await expect(page.locator(".modal-backdrop")).toHaveScreenshot("report-validation-error.png");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "このレシピを通報する" })).toBeFocused();
  await expect(page.locator(":focus")).toHaveScreenshot("keyboard-focus.png");
});

test("200%相当の拡大でも横スクロールを発生させない", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await settle(page);
  await page.addStyleTag({ content: "html { zoom: 2; }" });
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("home-200-percent.png", { fullPage: true });
});
