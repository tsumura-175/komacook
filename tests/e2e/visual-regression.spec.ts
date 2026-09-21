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
    test(`${viewport.name}pxでホームのレイアウトが崩れない`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await settle(page);
      await expectNoHorizontalOverflow(page);
      // WebKit はページ全体・長い要素の撮影に内部タイルサイズ上限があるため、
      // このケースでは初期表示のビューポートを比較する。Chromium/Firefoxでは
      // ページ全体も継続して比較する。
      if (testInfo.project.name === "visual-webkit") {
        await expect(page).toHaveScreenshot(`home-${viewport.name}.png`);
      } else {
        await expect(page).toHaveScreenshot(`home-${viewport.name}.png`, { fullPage: true });
      }
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

test("ログイン後の読み込み・通信失敗・入力エラーを比較する", async ({ page }, testInfo) => {
  // WebKitでは幅別レイアウト・長文・画像有無・拡大を比較する。認証後の
  // 画面状態はChromium/Firefoxで比較する。これはDocker Desktop経由の
  // ローカルAuth接続がLinux WebKitだけで待機し続けるためで、CIの偽失敗を避ける。
  test.skip(testInfo.project.name === "visual-webkit", "認証後の視覚状態はChromium/Firefoxで検証する。");
  await login(page);
  await login(page);
  await test.step("読み込み中", async () => {
    let releaseRequest: (() => void) | undefined;
    const requestHeld = new Promise<void>((resolve) => { releaseRequest = resolve; });
    await page.route("**/rest/v1/**", async (route) => {
      // 固定時間で待つと、環境によって page.goto 後には既に失敗表示へ
      // 遷移してしまう。スクリーンショット取得まで要求を保留して安定化する。
      await requestHeld;
      // テスト後のunrouteやページ終了で要求が既に終了している場合がある。
      // 表示確認後の二重処理は無視する。
      try { await route.abort("failed"); } catch { /* route was already handled */ }
    });
    try {
      // REST要求は意図的に保留するため、load完了待ちをしない。
      await page.goto("/mypage/recipes", { waitUntil: "commit" });
      await expect(page.getByText("マイレシピを読み込んでいます")).toBeVisible();
      await settle(page);
      await expect(page.locator(".my-recipes-main")).toHaveScreenshot("my-recipes-loading.png");
    } finally {
      releaseRequest?.();
      await page.unroute("**/rest/v1/**");
    }
  });

  await test.step("通信失敗", async () => {
    // 認証クライアントの内部実装差によるURL末尾の有無に依存せず、
    // Auth API全体を中断して利用者向けの通信失敗表示を検証する。
    const failedRoute = "**/auth/v1/**";
    const expectedMessage = "ログイン状態を確認できませんでした";
    await page.route(failedRoute, (route) => route.abort("failed"));
    await page.goto("/mypage/recipes", { waitUntil: "commit" });
    await expect(page.locator(".my-recipes-main .auth-error[role=alert]")).toContainText(expectedMessage, { timeout: 5_000 });
    await expect(page.locator(".my-recipes-main")).toHaveScreenshot("my-recipes-network-error.png");
    await page.unroute(failedRoute);
  });

  await test.step("入力エラー・モーダル・キーボード操作", async () => {
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
});

test("200%相当の拡大でも横スクロールを発生させない", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await settle(page);
  await page.addStyleTag({ content: "html { zoom: 2; }" });
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("home-200-percent.png", { fullPage: true });
});
