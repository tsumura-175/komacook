"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { queueTransactionalEmail } from "../../lib/email";
import { getSiteUrl } from "../../lib/site-url";
import { createClient } from "../../lib/supabase/server";
import { createAdminClient } from "../../lib/supabase/admin";
import { getD1Database, usesD1AppData } from "../../lib/d1-bindings";
import { deleteR2Images } from "../../lib/r2-images";

async function requireD1Admin() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login?next=/admin");
  const db = await getD1Database();
  const role = await db.prepare("SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin'").bind(authData.user.id).first();
  if (!role) redirect("/");
  return { db, admin: authData.user };
}

async function writeD1Audit(db: D1Database, adminUserId: string, actionType: string, targetType: string, targetId: string | null, reason: string, metadata: Record<string, unknown> = {}) {
  await db.prepare("INSERT INTO admin_actions (id, admin_user_id, action_type, target_type, target_id, reason, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), adminUserId, actionType, targetType, targetId, reason, JSON.stringify(metadata)).run();
}

async function notifyD1User(db: D1Database, adminUserId: string, input: { userId: string; type: string; title: string; body: string; targetType?: string; targetId?: string; actionHref?: string; sendEmail?: boolean }) {
  let emailStatus = input.sendEmail ? "failed" : "not_requested";
  let sentAt: string | null = null;
  let errorCode: string | null = null;
  if (input.sendEmail) {
    try {
      const { data, error } = await createAdminClient().auth.admin.getUserById(input.userId);
      if (error || !data.user?.email) throw new Error("NOTIFICATION_EMAIL_NOT_CONFIGURED");
      await queueTransactionalEmail("member_notification", { to: data.user.email, subject: `【こまクック】${input.title}`, text: [input.title, "", input.body, "", `お問い合わせ: ${getSiteUrl()}/contact`].join("\n") });
      emailStatus = "sent"; sentAt = new Date().toISOString();
    } catch (error) { errorCode = error instanceof Error ? error.message.slice(0, 100) : "MAIL_SEND_FAILED"; }
  }
  await db.prepare(`INSERT INTO user_notifications (id, user_id, notification_type, title, body, target_type, target_id, action_href, email_delivery_status, email_sent_at, email_error_code, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), input.userId, input.type, input.title, input.body, input.targetType ?? null, input.targetId ?? null, input.actionHref ?? null, emailStatus, sentAt, errorCode, adminUserId).run();
}

const updateSchema = z.object({ reportId: z.string().uuid(), status: z.enum(["open", "reviewing", "resolved", "dismissed"]), adminNote: z.string().trim().max(2000) });
const moderationSchema = z.object({ targetId: z.string().uuid(), reason: z.string().trim().min(1).max(1000) });
const categorySchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(30),
  sortOrder: z.coerce.number().int().min(0).max(32767),
});
const tagSchema = z.object({ tagId: z.string().uuid(), name: z.string().trim().min(1).max(20) });

async function requireAdmin() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login?next=/admin");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/");
  return { supabase, admin: authData.user };
}

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminUserId: string,
  actionType: string,
  targetType: string,
  targetId: string,
  reason: string,
  metadata: Record<string, unknown> = {},
) {
  await supabase.from("admin_actions").insert({ admin_user_id: adminUserId, action_type: actionType, target_type: targetType, target_id: targetId, reason, metadata });
}

async function notifyUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminUserId: string,
  input: { userId: string; type: string; title: string; body: string; targetType?: string; targetId?: string; actionHref?: string; sendEmail?: boolean },
) {
  let emailDeliveryStatus = "not_requested";
  let emailSentAt: string | null = null;
  let emailErrorCode: string | null = null;

  if (input.sendEmail) {
    emailDeliveryStatus = "failed";
    try {
      const { data: recipientEmail, error: emailLookupError } = await supabase.rpc("admin_get_user_email", { target_user_id: input.userId });
      if (emailLookupError || !recipientEmail) throw new Error("NOTIFICATION_EMAIL_NOT_CONFIGURED");
      await queueTransactionalEmail("member_notification", {
        to: recipientEmail,
        subject: `【こまクック】${input.title}`,
        text: [input.title, "", input.body, "", `お問い合わせ: ${getSiteUrl()}/contact`].join("\n"),
      });
      emailDeliveryStatus = "sent";
      emailSentAt = new Date().toISOString();
    } catch (error) {
      emailErrorCode = error instanceof Error ? error.message.slice(0, 100) : "MAIL_SEND_FAILED";
    }
  }

  await supabase.from("user_notifications").insert({
    user_id: input.userId,
    notification_type: input.type,
    title: input.title,
    body: input.body,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    action_href: input.actionHref ?? null,
    email_delivery_status: emailDeliveryStatus,
    email_sent_at: emailSentAt,
    email_error_code: emailErrorCode,
    created_by: adminUserId,
  });
  revalidatePath("/notices");
}

export async function updateReport(reportId: string, formData: FormData) {
  const parsed = updateSchema.safeParse({ reportId, status: formData.get("status"), adminNote: formData.get("admin_note") });
  if (!parsed.success) return;
  if (usesD1AppData()) {
    const { db, admin } = await requireD1Admin();
    const handled = parsed.data.status === "resolved" || parsed.data.status === "dismissed";
    await db.prepare("UPDATE reports SET status = ?, admin_note = ?, handled_by = ?, handled_at = ?, updated_at = ? WHERE id = ?")
      .bind(parsed.data.status, parsed.data.adminNote || null, handled ? admin.id : null, handled ? new Date().toISOString() : null, new Date().toISOString(), parsed.data.reportId).run();
    await writeD1Audit(db, admin.id, "report_status_updated", "report", parsed.data.reportId, `通報ステータスを${parsed.data.status}へ変更`, { status: parsed.data.status });
    revalidatePath("/admin"); revalidatePath("/admin/reports"); return;
  }
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return;
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return;
  const isHandled = parsed.data.status === "resolved" || parsed.data.status === "dismissed";
  const { error } = await supabase.from("reports").update({ status: parsed.data.status, admin_note: parsed.data.adminNote || null, handled_by: isHandled ? authData.user.id : null, handled_at: isHandled ? new Date().toISOString() : null }).eq("id", parsed.data.reportId);
  if (error) return;
  await supabase.from("admin_actions").insert({ admin_user_id: authData.user.id, action_type: "report_status_updated", target_type: "report", target_id: parsed.data.reportId, reason: `通報ステータスを${parsed.data.status}へ変更`, metadata: { status: parsed.data.status } });
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
}

export async function suspendUser(userId: string, formData: FormData) {
  const parsed = moderationSchema.safeParse({ targetId: userId, reason: formData.get("reason") });
  if (!parsed.success) redirect("/admin/users?result=invalid");
  if (usesD1AppData()) {
    const { db, admin } = await requireD1Admin();
    if (parsed.data.targetId === admin.id || await db.prepare("SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin'").bind(parsed.data.targetId).first()) redirect("/admin/users?result=self");
    const updated = await db.prepare("UPDATE profiles SET account_status = 'suspended', updated_at = ? WHERE user_id = ? AND account_status = 'active'").bind(new Date().toISOString(), parsed.data.targetId).run();
    if (!updated.meta.changes) redirect("/admin/users?result=unavailable");
    await writeD1Audit(db, admin.id, "user_suspended", "user", parsed.data.targetId, parsed.data.reason);
    await notifyD1User(db, admin.id, { userId: parsed.data.targetId, type: "account_suspended", title: "アカウントを利用停止しました", body: `運営による確認の結果、アカウントを利用停止しました。\n\n理由：${parsed.data.reason}\n\n確認や再開をご希望の場合は、お問い合わせフォームからご連絡ください。`, targetType: "user", targetId: parsed.data.targetId, actionHref: "/contact", sendEmail: true });
    revalidatePath("/admin"); revalidatePath("/admin/users"); redirect("/admin/users?result=suspended");
  }
  const { supabase, admin } = await requireAdmin();
  if (parsed.data.targetId === admin.id) redirect("/admin/users?result=self");

  const [{ data: profile }, { data: targetIsAdmin }] = await Promise.all([
    supabase.from("profiles").select("account_status").eq("user_id", parsed.data.targetId).maybeSingle(),
    supabase.rpc("is_admin", { check_user_id: parsed.data.targetId }),
  ]);
  if (!profile || targetIsAdmin || profile.account_status !== "active") redirect("/admin/users?result=unavailable");

  const { error } = await supabase.from("profiles").update({ account_status: "suspended" }).eq("user_id", parsed.data.targetId).eq("account_status", "active");
  if (error) redirect("/admin/users?result=error");
  await writeAudit(supabase, admin.id, "user_suspended", "user", parsed.data.targetId, parsed.data.reason);
  await notifyUser(supabase, admin.id, { userId: parsed.data.targetId, type: "account_suspended", title: "アカウントを利用停止しました", body: `運営による確認の結果、アカウントを利用停止しました。\n\n理由：${parsed.data.reason}\n\n確認や再開をご希望の場合は、お問い合わせフォームからご連絡ください。`, targetType: "user", targetId: parsed.data.targetId, actionHref: "/contact", sendEmail: true });
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  redirect("/admin/users?result=suspended");
}

export async function reactivateUser(userId: string, formData: FormData) {
  const parsed = moderationSchema.safeParse({ targetId: userId, reason: formData.get("reason") });
  if (!parsed.success) redirect("/admin/users?result=invalid");
  if (usesD1AppData()) {
    const { db, admin } = await requireD1Admin();
    const updated = await db.prepare("UPDATE profiles SET account_status = 'active', updated_at = ? WHERE user_id = ? AND account_status = 'suspended'").bind(new Date().toISOString(), parsed.data.targetId).run();
    if (!updated.meta.changes) redirect("/admin/users?result=unavailable");
    await writeD1Audit(db, admin.id, "user_reactivated", "user", parsed.data.targetId, parsed.data.reason);
    await notifyD1User(db, admin.id, { userId: parsed.data.targetId, type: "account_reactivated", title: "アカウントの利用を再開しました", body: `確認が完了したため、アカウントを利用再開しました。\n\n対応内容：${parsed.data.reason}`, targetType: "user", targetId: parsed.data.targetId, actionHref: "/mypage", sendEmail: true });
    revalidatePath("/admin"); revalidatePath("/admin/users"); redirect("/admin/users?result=reactivated");
  }
  const { supabase, admin } = await requireAdmin();
  const { error } = await supabase.from("profiles").update({ account_status: "active" }).eq("user_id", parsed.data.targetId).eq("account_status", "suspended");
  if (error) redirect("/admin/users?result=error");
  await writeAudit(supabase, admin.id, "user_reactivated", "user", parsed.data.targetId, parsed.data.reason);
  await notifyUser(supabase, admin.id, { userId: parsed.data.targetId, type: "account_reactivated", title: "アカウントの利用を再開しました", body: `確認が完了したため、アカウントの利用を再開しました。\n\n対応内容：${parsed.data.reason}`, targetType: "user", targetId: parsed.data.targetId, actionHref: "/mypage", sendEmail: true });
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  redirect("/admin/users?result=reactivated");
}

export async function resetProfilePresentation(userId: string, formData: FormData) {
  const parsed = moderationSchema.safeParse({ targetId: userId, reason: formData.get("reason") });
  if (!parsed.success) redirect("/admin/users?result=invalid");
  if (usesD1AppData()) {
    const { db, admin } = await requireD1Admin();
    if (parsed.data.targetId === admin.id) redirect("/admin/users?result=self");
    const profile = await db.prepare("SELECT avatar_key FROM profiles WHERE user_id = ?").bind(parsed.data.targetId).first<{ avatar_key: string | null }>();
    if (!profile) redirect("/admin/users?result=unavailable");
    await db.prepare("UPDATE profiles SET display_name = 'こまクックユーザー', avatar_kind = 'preset', preset_avatar_key = 'utensils', avatar_color = 'coral', avatar_key = NULL, updated_at = ? WHERE user_id = ?").bind(new Date().toISOString(), parsed.data.targetId).run();
    if (profile.avatar_key) await deleteR2Images([profile.avatar_key]);
    await writeD1Audit(db, admin.id, "profile_presentation_reset", "user", parsed.data.targetId, parsed.data.reason);
    await notifyD1User(db, admin.id, { userId: parsed.data.targetId, type: "profile_reset", title: "プロフィール情報を初期状態へ戻しました", body: `表示名とプロフィール画像を初期状態へ戻しました。\n\n理由：${parsed.data.reason}\n\nマイページから適切な内容を設定してください。`, targetType: "user", targetId: parsed.data.targetId, actionHref: "/settings/profile" });
    revalidatePath("/admin/users"); revalidatePath(`/users/${parsed.data.targetId}`); redirect("/admin/users?result=profile-reset");
  }
  const { supabase, admin } = await requireAdmin();
  if (parsed.data.targetId === admin.id) redirect("/admin/users?result=self");

  const { error } = await supabase.from("profiles").update({
    display_name: "こまクックユーザー",
    avatar_kind: "preset",
    preset_avatar_key: "utensils",
    avatar_color: "coral",
    avatar_path: null,
  }).eq("user_id", parsed.data.targetId);
  if (error) redirect("/admin/users?result=error");
  await writeAudit(supabase, admin.id, "profile_presentation_reset", "user", parsed.data.targetId, parsed.data.reason);
  await notifyUser(supabase, admin.id, { userId: parsed.data.targetId, type: "profile_reset", title: "プロフィール情報を初期状態へ戻しました", body: `表示名とプロフィール画像を初期状態へ戻しました。\n\n理由：${parsed.data.reason}\n\nマイページから適切な内容を設定してください。`, targetType: "user", targetId: parsed.data.targetId, actionHref: "/settings/profile" });
  revalidatePath("/admin/users");
  revalidatePath(`/users/${parsed.data.targetId}`);
  redirect("/admin/users?result=profile-reset");
}

export async function unpublishRecipe(recipeId: string, formData: FormData) {
  const parsed = moderationSchema.safeParse({ targetId: recipeId, reason: formData.get("reason") });
  if (!parsed.success) redirect("/admin/recipes?result=invalid");
  if (usesD1AppData()) {
    const { db, admin } = await requireD1Admin();
    const recipe = await db.prepare("SELECT title, owner_user_id, visibility, status, moderated_at FROM recipes WHERE id = ?").bind(parsed.data.targetId).first<{ title: string; owner_user_id: string | null; visibility: string; status: string; moderated_at: string | null }>();
    if (!recipe || recipe.visibility !== "public" || recipe.status !== "published" || recipe.moderated_at) redirect("/admin/recipes?result=unavailable");
    const now = new Date().toISOString();
    await db.prepare("UPDATE recipes SET visibility = 'private', moderated_at = ?, moderated_by = ?, moderation_reason = ?, moderation_previous_visibility = 'public', updated_at = ? WHERE id = ? AND visibility = 'public' AND moderated_at IS NULL").bind(now, admin.id, parsed.data.reason, now, parsed.data.targetId).run();
    await writeD1Audit(db, admin.id, "recipe_unpublished", "recipe", parsed.data.targetId, parsed.data.reason, { previous_visibility: "public" });
    if (recipe.owner_user_id) await notifyD1User(db, admin.id, { userId: recipe.owner_user_id, type: "recipe_unpublished", title: `「${recipe.title}」を公開停止しました`, body: `投稿内容の確認により、このレシピを公開停止しました。\n\n理由：${parsed.data.reason}\n\n内容を確認し、必要な修正についてはお問い合わせフォームからご連絡ください。`, targetType: "recipe", targetId: parsed.data.targetId, actionHref: "/mypage/recipes" });
    revalidatePath("/"); revalidatePath("/recipes"); revalidatePath(`/recipes/${parsed.data.targetId}`); revalidatePath("/admin/recipes"); redirect("/admin/recipes?result=unpublished");
  }
  const { supabase, admin } = await requireAdmin();
  const { data: recipe } = await supabase.from("recipes").select("title, owner_user_id, visibility, status, moderated_at").eq("id", parsed.data.targetId).maybeSingle();
  if (!recipe || recipe.visibility !== "public" || recipe.status !== "published" || recipe.moderated_at) redirect("/admin/recipes?result=unavailable");

  const now = new Date().toISOString();
  const { error } = await supabase.from("recipes").update({
    visibility: "private",
    moderated_at: now,
    moderated_by: admin.id,
    moderation_reason: parsed.data.reason,
    moderation_previous_visibility: recipe.visibility,
  }).eq("id", parsed.data.targetId).eq("visibility", "public").is("moderated_at", null);
  if (error) redirect("/admin/recipes?result=error");
  await writeAudit(supabase, admin.id, "recipe_unpublished", "recipe", parsed.data.targetId, parsed.data.reason, { previous_visibility: recipe.visibility });
  if (recipe.owner_user_id) await notifyUser(supabase, admin.id, { userId: recipe.owner_user_id, type: "recipe_unpublished", title: `「${recipe.title}」を公開停止しました`, body: `投稿内容の確認により、このレシピを公開停止しました。\n\n理由：${parsed.data.reason}\n\n内容を確認し、必要な修正についてはお問い合わせフォームからご連絡ください。`, targetType: "recipe", targetId: parsed.data.targetId, actionHref: "/mypage/recipes" });
  revalidatePath("/");
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${parsed.data.targetId}`);
  revalidatePath("/admin/recipes");
  redirect("/admin/recipes?result=unpublished");
}

export async function restoreRecipe(recipeId: string, formData: FormData) {
  const parsed = moderationSchema.safeParse({ targetId: recipeId, reason: formData.get("reason") });
  if (!parsed.success) redirect("/admin/recipes?result=invalid");
  if (usesD1AppData()) {
    const { db, admin } = await requireD1Admin();
    const recipe = await db.prepare("SELECT title, owner_user_id, moderated_at, moderation_previous_visibility, status FROM recipes WHERE id = ?").bind(parsed.data.targetId).first<{ title: string; owner_user_id: string | null; moderated_at: string | null; moderation_previous_visibility: string | null; status: string }>();
    if (!recipe?.moderated_at || recipe.moderation_previous_visibility !== "public" || recipe.status !== "published") redirect("/admin/recipes?result=unavailable");
    await db.prepare("UPDATE recipes SET visibility = 'public', moderated_at = NULL, moderated_by = NULL, moderation_reason = NULL, moderation_previous_visibility = NULL, updated_at = ? WHERE id = ? AND moderated_at IS NOT NULL").bind(new Date().toISOString(), parsed.data.targetId).run();
    await writeD1Audit(db, admin.id, "recipe_restored", "recipe", parsed.data.targetId, parsed.data.reason);
    if (recipe.owner_user_id) await notifyD1User(db, admin.id, { userId: recipe.owner_user_id, type: "recipe_restored", title: `「${recipe.title}」を再公開しました`, body: `確認が完了したため、このレシピを再公開しました。\n\n対応内容：${parsed.data.reason}`, targetType: "recipe", targetId: parsed.data.targetId, actionHref: `/recipes/${parsed.data.targetId}` });
    revalidatePath("/"); revalidatePath("/recipes"); revalidatePath(`/recipes/${parsed.data.targetId}`); revalidatePath("/admin/recipes"); redirect("/admin/recipes?result=restored");
  }
  const { supabase, admin } = await requireAdmin();
  const { data: recipe } = await supabase.from("recipes").select("title, owner_user_id, moderated_at, moderation_previous_visibility, status").eq("id", parsed.data.targetId).maybeSingle();
  if (!recipe?.moderated_at || recipe.moderation_previous_visibility !== "public" || recipe.status !== "published") redirect("/admin/recipes?result=unavailable");

  const { error } = await supabase.from("recipes").update({
    visibility: "public",
    moderated_at: null,
    moderated_by: null,
    moderation_reason: null,
    moderation_previous_visibility: null,
  }).eq("id", parsed.data.targetId).not("moderated_at", "is", null);
  if (error) redirect("/admin/recipes?result=error");
  await writeAudit(supabase, admin.id, "recipe_restored", "recipe", parsed.data.targetId, parsed.data.reason);
  if (recipe.owner_user_id) await notifyUser(supabase, admin.id, { userId: recipe.owner_user_id, type: "recipe_restored", title: `「${recipe.title}」を再公開しました`, body: `確認が完了したため、このレシピを再公開しました。\n\n対応内容：${parsed.data.reason}`, targetType: "recipe", targetId: parsed.data.targetId, actionHref: `/recipes/${parsed.data.targetId}` });
  revalidatePath("/");
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${parsed.data.targetId}`);
  revalidatePath("/admin/recipes");
  redirect("/admin/recipes?result=restored");
}

export async function saveCategory(categoryId: string | undefined, formData: FormData) {
  const parsed = categorySchema.safeParse({ categoryId: categoryId || undefined, name: formData.get("name"), sortOrder: formData.get("sort_order") });
  if (!parsed.success) redirect("/admin/categories?result=taxonomy-invalid");
  if (usesD1AppData()) {
    const { db, admin } = await requireD1Admin();
    try {
      if (parsed.data.categoryId) {
        const existing = await db.prepare("SELECT name FROM categories WHERE id = ?").bind(parsed.data.categoryId).first<{ name: string }>();
        if (!existing) redirect("/admin/categories?result=taxonomy-unavailable");
        await db.prepare("UPDATE categories SET name = ?, sort_order = ?, updated_at = ? WHERE id = ?").bind(parsed.data.name, parsed.data.sortOrder, new Date().toISOString(), parsed.data.categoryId).run();
        await writeD1Audit(db, admin.id, "category_updated", "category", parsed.data.categoryId, `カテゴリ「${existing.name}」を「${parsed.data.name}」へ更新`, { sort_order: parsed.data.sortOrder });
      } else {
        const id = crypto.randomUUID();
        await db.prepare("INSERT INTO categories (id, slug, name, sort_order) VALUES (?, ?, ?, ?)").bind(id, `custom-${id.slice(0, 8)}`, parsed.data.name, parsed.data.sortOrder).run();
        await writeD1Audit(db, admin.id, "category_created", "category", id, `カテゴリ「${parsed.data.name}」を追加`, { sort_order: parsed.data.sortOrder });
      }
    } catch { redirect("/admin/categories?result=taxonomy-duplicate"); }
    revalidatePath("/"); revalidatePath("/recipes"); revalidatePath("/recipes/new"); revalidatePath("/admin/categories"); redirect(`/admin/categories?result=${parsed.data.categoryId ? "category-updated" : "category-created"}`);
  }
  const { supabase, admin } = await requireAdmin();
  const payload = { name: parsed.data.name, sort_order: parsed.data.sortOrder };

  if (parsed.data.categoryId) {
    const { data: existing } = await supabase.from("categories").select("name").eq("id", parsed.data.categoryId).maybeSingle();
    if (!existing) redirect("/admin/categories?result=taxonomy-unavailable");
    const { error } = await supabase.from("categories").update(payload).eq("id", parsed.data.categoryId);
    if (error) redirect(`/admin/categories?result=${error.code === "23505" ? "taxonomy-duplicate" : "taxonomy-error"}`);
    await writeAudit(supabase, admin.id, "category_updated", "category", parsed.data.categoryId, `カテゴリ「${existing.name}」を「${parsed.data.name}」へ更新`, { sort_order: parsed.data.sortOrder });
  } else {
    const { data: created, error } = await supabase.from("categories").insert({ ...payload, slug: `custom-${crypto.randomUUID().slice(0, 8)}` }).select("id").single();
    if (error || !created) redirect(`/admin/categories?result=${error?.code === "23505" ? "taxonomy-duplicate" : "taxonomy-error"}`);
    await writeAudit(supabase, admin.id, "category_created", "category", created.id, `カテゴリ「${parsed.data.name}」を追加`, { sort_order: parsed.data.sortOrder });
  }
  revalidatePath("/");
  revalidatePath("/recipes");
  revalidatePath("/recipes/new");
  revalidatePath("/admin/categories");
  redirect(`/admin/categories?result=${parsed.data.categoryId ? "category-updated" : "category-created"}`);
}

export async function toggleCategory(categoryId: string, formData: FormData) {
  const parsed = z.object({ categoryId: z.string().uuid(), active: z.enum(["true", "false"]) }).safeParse({ categoryId, active: formData.get("active") });
  if (!parsed.success) redirect("/admin/categories?result=taxonomy-invalid");
  if (usesD1AppData()) {
    const { db, admin } = await requireD1Admin();
    const category = await db.prepare("SELECT name, slug, is_active FROM categories WHERE id = ?").bind(parsed.data.categoryId).first<{ name: string; slug: string; is_active: number }>();
    if (!category) redirect("/admin/categories?result=taxonomy-unavailable");
    const nextActive = parsed.data.active === "true";
    if (!nextActive && category.slug === "other") redirect("/admin/categories?result=category-required");
    if (!nextActive && await db.prepare("SELECT 1 FROM recipes WHERE category_id = ? LIMIT 1").bind(parsed.data.categoryId).first()) redirect("/admin/categories?result=category-in-use");
    await db.prepare("UPDATE categories SET is_active = ?, updated_at = ? WHERE id = ?").bind(nextActive ? 1 : 0, new Date().toISOString(), parsed.data.categoryId).run();
    await writeD1Audit(db, admin.id, nextActive ? "category_activated" : "category_deactivated", "category", parsed.data.categoryId, `カテゴリ「${category.name}」を${nextActive ? "有効化" : "無効化"}`);
    revalidatePath("/recipes"); revalidatePath("/recipes/new"); revalidatePath("/admin/categories"); redirect(`/admin/categories?result=${nextActive ? "category-activated" : "category-deactivated"}`);
  }
  const { supabase, admin } = await requireAdmin();
  const { data: category } = await supabase.from("categories").select("name,slug,is_active").eq("id", parsed.data.categoryId).maybeSingle();
  if (!category) redirect("/admin/categories?result=taxonomy-unavailable");
  const nextActive = parsed.data.active === "true";
  if (!nextActive && category.slug === "other") redirect("/admin/categories?result=category-required");
  if (!nextActive) {
    const { count } = await supabase.from("recipes").select("id", { count: "exact", head: true }).eq("category_id", parsed.data.categoryId);
    if ((count ?? 0) > 0) redirect("/admin/categories?result=category-in-use");
  }
  const { error } = await supabase.from("categories").update({ is_active: nextActive }).eq("id", parsed.data.categoryId);
  if (error) redirect("/admin/categories?result=taxonomy-error");
  await writeAudit(supabase, admin.id, nextActive ? "category_activated" : "category_deactivated", "category", parsed.data.categoryId, `カテゴリ「${category.name}」を${nextActive ? "有効化" : "無効化"}`);
  revalidatePath("/recipes");
  revalidatePath("/recipes/new");
  revalidatePath("/admin/categories");
  redirect(`/admin/categories?result=${nextActive ? "category-activated" : "category-deactivated"}`);
}

export async function saveTag(tagId: string, formData: FormData) {
  const parsed = tagSchema.safeParse({ tagId, name: formData.get("name") });
  if (!parsed.success) redirect("/admin/categories?result=taxonomy-invalid");
  if (usesD1AppData()) {
    const { db, admin } = await requireD1Admin();
    const existing = await db.prepare("SELECT name FROM tags WHERE id = ?").bind(parsed.data.tagId).first<{ name: string }>();
    if (!existing) redirect("/admin/categories?result=taxonomy-unavailable");
    try { await db.prepare("UPDATE tags SET name = ?, normalized_name = ? WHERE id = ?").bind(parsed.data.name, parsed.data.name.toLocaleLowerCase("ja"), parsed.data.tagId).run(); }
    catch { redirect("/admin/categories?result=taxonomy-duplicate"); }
    await writeD1Audit(db, admin.id, "tag_updated", "tag", parsed.data.tagId, `タグ「${existing.name}」を「${parsed.data.name}」へ変更`);
    revalidatePath("/"); revalidatePath("/recipes"); revalidatePath("/admin/categories"); redirect("/admin/categories?result=tag-updated");
  }
  const { supabase, admin } = await requireAdmin();
  const { data: existing } = await supabase.from("tags").select("name").eq("id", parsed.data.tagId).maybeSingle();
  if (!existing) redirect("/admin/categories?result=taxonomy-unavailable");
  const { error } = await supabase.from("tags").update({ name: parsed.data.name }).eq("id", parsed.data.tagId);
  if (error) redirect(`/admin/categories?result=${error.code === "23505" ? "taxonomy-duplicate" : "taxonomy-error"}`);
  await writeAudit(supabase, admin.id, "tag_updated", "tag", parsed.data.tagId, `タグ「${existing.name}」を「${parsed.data.name}」へ変更`);
  revalidatePath("/");
  revalidatePath("/recipes");
  revalidatePath("/admin/categories");
  redirect("/admin/categories?result=tag-updated");
}

export async function toggleTag(tagId: string, formData: FormData) {
  const parsed = z.object({ tagId: z.string().uuid(), active: z.enum(["true", "false"]) }).safeParse({ tagId, active: formData.get("active") });
  if (!parsed.success) redirect("/admin/categories?result=taxonomy-invalid");
  if (usesD1AppData()) {
    const { db, admin } = await requireD1Admin();
    const tag = await db.prepare("SELECT name FROM tags WHERE id = ?").bind(parsed.data.tagId).first<{ name: string }>();
    if (!tag) redirect("/admin/categories?result=taxonomy-unavailable");
    const nextActive = parsed.data.active === "true";
    await db.prepare("UPDATE tags SET is_active = ? WHERE id = ?").bind(nextActive ? 1 : 0, parsed.data.tagId).run();
    await writeD1Audit(db, admin.id, nextActive ? "tag_activated" : "tag_deactivated", "tag", parsed.data.tagId, `タグ「${tag.name}」を${nextActive ? "有効化" : "無効化"}`);
    revalidatePath("/"); revalidatePath("/recipes"); revalidatePath("/admin/categories"); redirect(`/admin/categories?result=${nextActive ? "tag-activated" : "tag-deactivated"}`);
  }
  const { supabase, admin } = await requireAdmin();
  const { data: tag } = await supabase.from("tags").select("name").eq("id", parsed.data.tagId).maybeSingle();
  if (!tag) redirect("/admin/categories?result=taxonomy-unavailable");
  const nextActive = parsed.data.active === "true";
  const { error } = await supabase.from("tags").update({ is_active: nextActive }).eq("id", parsed.data.tagId);
  if (error) redirect("/admin/categories?result=taxonomy-error");
  await writeAudit(supabase, admin.id, nextActive ? "tag_activated" : "tag_deactivated", "tag", parsed.data.tagId, `タグ「${tag.name}」を${nextActive ? "有効化" : "無効化"}`);
  revalidatePath("/");
  revalidatePath("/recipes");
  revalidatePath("/admin/categories");
  redirect(`/admin/categories?result=${nextActive ? "tag-activated" : "tag-deactivated"}`);
}
