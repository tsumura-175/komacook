import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, createMember, databaseClient, login, removeMember, uniqueValue } from "./helpers";

test.describe("保存・コピー・通報・管理", () => {
  test("レシピの保存解除・自分用コピー・通報から管理者対応まで確認できる", async ({ page }) => {
    const member = await createMember({ displayName: "通報テスト会員" });
    const sql = databaseClient();
    const sourceOwner = (await sql<{ user_id: string }[]>`select user_id from public.profiles where display_name = 'はるママ' limit 1`)[0];
    const category = (await sql<{ id: string }[]>`select id from public.categories where is_active = true order by sort_order limit 1`)[0];
    const recipeId = crypto.randomUUID();
    let copiedId: string | undefined;
    try {
      await sql`insert into public.recipes (id, owner_user_id, title, category_id, base_servings, visibility, status, source_type, published_at)
        values (${recipeId}, ${sourceOwner.user_id}, ${uniqueValue("通報対象レシピ")}, ${category.id}, 2, 'public', 'published', 'manual', now())`;
      await login(page, member.email, member.password);
      await page.goto(`/recipes/${recipeId}`);
      const saveButton = page.getByRole("button", { name: "保存する" });
      await saveButton.click();
      await expect(page.getByRole("button", { name: "保存から外す" })).toBeVisible();
      await expect.poll(async () => (await sql`select recipe_id from public.favorites where user_id = ${member.user.id} and recipe_id = ${recipeId}`).length).toBe(1);
      await page.getByRole("button", { name: "保存から外す" }).click();
      await expect(page.getByRole("button", { name: "保存する" })).toBeVisible();
      await expect.poll(async () => (await sql`select recipe_id from public.favorites where user_id = ${member.user.id} and recipe_id = ${recipeId}`).length).toBe(0);

      await page.getByRole("button", { name: /自分用にコピー/ }).click();
      await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+\/edit/);
      copiedId = page.url().match(/\/recipes\/([0-9a-f-]+)\/edit/)?.[1];
      expect(copiedId).toBeTruthy();
      const copied = (await sql<{ owner_user_id: string; source_type: string; visibility: string; status: string }[]>`select owner_user_id, source_type::text, visibility::text, status::text from public.recipes where id = ${copiedId!}`)[0];
      expect(copied).toMatchObject({ owner_user_id: member.user.id, source_type: "copied", visibility: "private", status: "published" });

      await page.goto(`/recipes/${recipeId}`);
      await page.getByRole("button", { name: "このレシピを通報する" }).click();
      await page.getByText("危険または不正確な内容", { exact: true }).click();
      await page.getByLabel("補足（任意）").fill("E2Eの回帰テストとして危険な内容の通報から管理者対応までを確認しています。");
      await page.getByRole("button", { name: "通報を送信" }).click();
      await expect(page.getByRole("heading", { name: "通報を受け付けました" })).toBeVisible();
      const report = (await sql<{ id: string; status: string }[]>`select id, status::text from public.reports where reporter_user_id = ${member.user.id} and recipe_id = ${recipeId}`)[0];
      expect(report.status).toBe("open");

      await page.goto("/auth/signout");
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto("/admin/reports");
      const reportCard = page.locator(".admin-report-card").filter({ hasText: "E2Eの回帰テストとして危険な内容の通報から管理者対応までを確認しています。" });
      await expect(reportCard).toBeVisible();
      await reportCard.getByLabel("対応状態").selectOption("resolved");
      await reportCard.getByLabel("管理メモ").fill("内容を確認し対応済み");
      await reportCard.getByRole("button", { name: "対応内容を保存" }).click();
      await expect.poll(async () => (await sql<{ status: string; admin_note: string }[]>`select status::text, admin_note from public.reports where id = ${report.id}`)[0]).toMatchObject({ status: "resolved", admin_note: "内容を確認し対応済み" });
      expect((await sql`select id from public.admin_actions where action_type = 'report_status_updated' and target_id = ${report.id}`).length).toBe(1);
    } finally {
      if (copiedId) await sql`delete from public.recipes where id = ${copiedId}`;
      await sql`delete from public.recipes where id = ${recipeId}`;
      await removeMember(member.user);
      await sql.end();
    }
  });

  test("管理者がお知らせを作成・公開し、既読情報と一緒に削除できる", async ({ page }) => {
    const sql = databaseClient();
    const title = uniqueValue("E2Eお知らせ");
    let noticeId: string | undefined;
    try {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto("/admin/notices");
      const createEditor = page.locator("details.admin-notice-editor").first();
      await createEditor.getByLabel("タイトル").fill(title);
      await createEditor.getByLabel("本文").fill("回帰テストで作成したお知らせ本文です。");
      await createEditor.getByLabel("状態").selectOption("published");
      await createEditor.getByRole("button", { name: "お知らせを作成" }).click();
      await expect.poll(async () => (await sql<{ id: string; status: string }[]>`select id, status::text from public.notices where title = ${title}`)[0]).toMatchObject({ status: "published" });
      noticeId = (await sql<{ id: string }[]>`select id from public.notices where title = ${title}`)[0].id;
      await sql`insert into public.notice_reads (notice_id, user_id) select ${noticeId}, id from auth.users where email = 'user@komacook.local'`;

      await page.reload();
      const editor = page.locator("details.admin-notice-editor").filter({ hasText: title });
      await editor.locator("summary").click();
      await editor.getByRole("button", { name: "削除" }).click();
      await page.getByRole("dialog", { name: "お知らせを削除しますか？" }).getByRole("button", { name: "削除する" }).click();
      await expect.poll(async () => (await sql`select id from public.notices where id = ${noticeId!}`).length).toBe(0);
      expect((await sql`select notice_id from public.notice_reads where notice_id = ${noticeId!}`).length).toBe(0);
      expect((await sql`select id from public.admin_actions where action_type = 'notice_deleted' and target_id = ${noticeId!}`).length).toBe(1);
    } finally {
      if (noticeId) await sql`delete from public.notices where id = ${noticeId}`;
      await sql.end();
    }
  });
});
