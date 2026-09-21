import { expect, test, type Page } from "@playwright/test";
import { adminClient, createMember, databaseClient, login, removeMember, uniqueValue } from "./helpers";

async function submitContact(page: Page, index: number) {
  await page.goto("/contact");
  await page.getByLabel(/お名前/).fill("回数制限テスト");
  await page.getByLabel(/返信先メール/).fill("rate-limit@komacook.local");
  await page.getByLabel(/種別/).selectOption("サービス");
  await page.getByLabel(/件名/).fill(`送信制限確認${index}`);
  await page.getByLabel(/本文/).fill("お問い合わせ送信制限を確認するための本文です。");
  await page.waitForTimeout(3_100);
  await page.getByRole("button", { name: "入力内容を確認" }).click();
  await page.getByRole("button", { name: "この内容で送信する" }).click();
}

test.describe("権限と運用処理", () => {
  test("未ログイン・一般会員・別会員による保護画面へのアクセスを拒否する", async ({ page }) => {
    const admin = adminClient();
    const member = await createMember({ displayName: "権限確認テスト会員" });
    const privateRecipe = await admin.from("recipes").select("id,owner_user_id").eq("visibility", "private").eq("status", "published").limit(1).single();
    const otherRecipe = await admin.from("recipes").select("id").eq("visibility", "public").neq("owner_user_id", member.user.id).limit(1).single();
    try {
      await page.goto("/mypage");
      await expect(page).toHaveURL(/\/login\?next=%2Fmypage/);
      await page.goto(`/recipes/${privateRecipe.data!.id}`);
      await expect(page.getByRole("heading", { name: "該当のレシピが存在しません" })).toBeVisible();

      await login(page, member.email, member.password);
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/$/);
      await page.goto(`/recipes/${otherRecipe.data!.id}/edit`);
      await expect(page).toHaveURL(/\/mypage\/recipes/);
    } finally {
      await removeMember(member.user);
    }
  });

  test("お問い合わせは同じ送信元から10分間に3回までに制限される", async ({ page }) => {
    test.setTimeout(60_000);
    const sql = databaseClient();
    await sql`delete from public.contact_rate_limits`;
    try {
      for (let index = 1; index <= 3; index += 1) {
        await submitContact(page, index);
        await expect(page.getByRole("heading", { name: "送信を受け付けました" })).toBeVisible();
      }
      await submitContact(page, 4);
      await expect(page.locator(".auth-error")).toContainText("送信回数の上限に達しました");
      const logs = await sql`select id from public.contact_logs where inquiry_type = 'サービス' and delivery_succeeded = true`;
      expect(logs.length).toBeGreaterThanOrEqual(3);
    } finally {
      await sql`delete from public.contact_rate_limits`;
      await sql.end();
    }
  });

  test("退会申請を30日経過扱いにするとAuth会員を含めて削除する", async ({ page }) => {
    const member = await createMember({ displayName: "退会処理テスト会員" });
    const admin = adminClient();
    const sql = databaseClient();
    try {
      await login(page, member.email, member.password);
      await page.goto("/settings/withdraw");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "退会を申請する" }).click();
      await expect(page.getByRole("heading", { name: "退会処理を受け付けています" })).toBeVisible();
      const request = (await sql<{ status: string; delete_after: Date }[]>`select status::text, delete_after from public.account_deletion_requests where user_id = ${member.user.id}`)[0];
      expect(request.status).toBe("pending");
      expect(new Date(request.delete_after).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
      await sql`update public.account_deletion_requests set requested_at = now() - interval '31 days', delete_after = now() - interval '1 day' where user_id = ${member.user.id}`;

      const response = await page.request.post("/api/internal/account-deletions", { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } });
      expect(response.ok()).toBeTruthy();
      const body = await response.json() as { deleted: number; results: Array<{ userId: string; status: string }> };
      expect(body.results).toContainEqual({ userId: member.user.id, status: "deleted" });
      const authLookup = await admin.auth.admin.getUserById(member.user.id);
      expect(authLookup.data.user).toBeNull();
      expect((await sql`select user_id from public.profiles where user_id = ${member.user.id}`).length).toBe(0);
    } finally {
      await removeMember(member.user);
      await sql.end();
    }
  });

  test("退会対象の公開レシピは匿名化し、非公開レシピは削除する", async ({ request }) => {
    const member = await createMember({ displayName: "退会レシピテスト会員" });
    const sql = databaseClient();
    const category = (await sql<{ id: string }[]>`select id from public.categories where is_active = true order by sort_order limit 1`)[0];
    const publicId = crypto.randomUUID();
    const privateId = crypto.randomUUID();
    try {
      await sql`insert into public.recipes (id, owner_user_id, title, category_id, base_servings, visibility, status, source_type, published_at) values
        (${publicId}, ${member.user.id}, ${uniqueValue("退会後公開")}, ${category.id}, 2, 'public', 'published', 'manual', now()),
        (${privateId}, ${member.user.id}, ${uniqueValue("退会後非公開")}, ${category.id}, 2, 'private', 'published', 'manual', now())`;
      await sql`insert into public.account_deletion_requests (user_id, status, requested_at, delete_after) values (${member.user.id}, 'pending', now() - interval '31 days', now() - interval '1 day')`;
      await sql`update public.profiles set account_status = 'deletion_pending' where user_id = ${member.user.id}`;
      const response = await request.post("/api/internal/account-deletions", { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } });
      expect(response.ok()).toBeTruthy();
      expect((await sql<{ owner_user_id: string | null; visibility: string; status: string }[]>`select owner_user_id, visibility::text, status::text from public.recipes where id = ${publicId}`)[0]).toMatchObject({ owner_user_id: null, visibility: "public", status: "published" });
      expect((await sql`select id from public.recipes where id = ${privateId}`).length).toBe(0);
    } finally {
      await sql`delete from public.recipes where id in (${publicId}, ${privateId})`;
      await removeMember(member.user);
      await sql.end();
    }
  });
});
