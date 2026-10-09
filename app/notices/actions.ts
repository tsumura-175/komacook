"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "../../lib/supabase/server";
import { getD1Database, usesD1AppData } from "../../lib/d1-bindings";

async function isD1Admin(userId: string) {
  const db = await getD1Database();
  return Boolean(await db.prepare("SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin'").bind(userId).first());
}

const noticeSchema = z.object({
  title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(10000),
  status: z.enum(["draft", "scheduled", "published", "hidden"]), audience: z.enum(["all", "members"]),
  isPinned: z.boolean(), publishAt: z.string(), endAt: z.string(),
});

export async function saveNotice(noticeId: string, formData: FormData) {
  const parsed = noticeSchema.safeParse({ title: formData.get("title"), body: formData.get("body"), status: formData.get("status"), audience: formData.get("audience"), isPinned: formData.get("is_pinned") === "on", publishAt: String(formData.get("publish_at") ?? ""), endAt: String(formData.get("end_at") ?? "") });
  if (!parsed.success) return;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return;
  if (usesD1AppData()) {
    if (!await isD1Admin(authData.user.id)) return;
    const publishAt = parsed.data.publishAt ? new Date(parsed.data.publishAt) : parsed.data.status === "published" ? new Date() : null;
    const endAt = parsed.data.endAt ? new Date(parsed.data.endAt) : null;
    if ((publishAt && Number.isNaN(publishAt.getTime())) || (endAt && Number.isNaN(endAt.getTime())) || (publishAt && endAt && endAt <= publishAt) || (parsed.data.status === "scheduled" && (!publishAt || publishAt <= new Date()))) return;
    const db = await getD1Database();
    const storedStatus = parsed.data.status === "scheduled" ? "published" : parsed.data.status;
    const id = noticeId || crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO notices (id, title, body, status, audience, is_pinned, publish_at, end_at, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, body = excluded.body, status = excluded.status, audience = excluded.audience, is_pinned = excluded.is_pinned, publish_at = excluded.publish_at, end_at = excluded.end_at, updated_at = excluded.updated_at`)
      .bind(id, parsed.data.title, parsed.data.body, storedStatus, parsed.data.audience, parsed.data.isPinned ? 1 : 0, publishAt?.toISOString() ?? null, endAt?.toISOString() ?? null, authData.user.id, now, now).run();
    await db.prepare("INSERT INTO admin_actions (id, admin_user_id, action_type, target_type, target_id, reason, metadata_json) VALUES (?, ?, ?, 'notice', ?, ?, ?)")
      .bind(crypto.randomUUID(), authData.user.id, noticeId ? "notice_updated" : "notice_created", id, noticeId ? "お知らせを更新" : "お知らせを作成", JSON.stringify({ status: parsed.data.status, audience: parsed.data.audience })).run();
    revalidatePath("/admin/notices"); revalidatePath("/notices"); revalidatePath(`/notices/${id}`);
    return;
  }
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return;
  const publishAt = parsed.data.publishAt ? new Date(parsed.data.publishAt) : parsed.data.status === "published" ? new Date() : null;
  const endAt = parsed.data.endAt ? new Date(parsed.data.endAt) : null;
  if ((publishAt && Number.isNaN(publishAt.getTime())) || (endAt && Number.isNaN(endAt.getTime())) || (publishAt && endAt && endAt <= publishAt) || (parsed.data.status === "scheduled" && (!publishAt || publishAt <= new Date()))) return;
  // RLSの公開日時判定を利用し、予約公開はpublished＋未来日時として保存する。
  const storedStatus = parsed.data.status === "scheduled" ? "published" : parsed.data.status;
  const payload = { title: parsed.data.title, body: parsed.data.body, status: storedStatus, audience: parsed.data.audience, is_pinned: parsed.data.isPinned, publish_at: publishAt?.toISOString() ?? null, end_at: endAt?.toISOString() ?? null };
  const mutation = noticeId ? supabase.from("notices").update(payload).eq("id", noticeId) : supabase.from("notices").insert({ ...payload, created_by: authData.user.id });
  const { error } = await mutation;
  if (error) return;
  await supabase.from("admin_actions").insert({ admin_user_id: authData.user.id, action_type: noticeId ? "notice_updated" : "notice_created", target_type: "notice", target_id: noticeId || null, reason: noticeId ? "お知らせを更新" : "お知らせを作成", metadata: { status: parsed.data.status, audience: parsed.data.audience } });
  revalidatePath("/admin/notices"); revalidatePath("/notices"); if (noticeId) revalidatePath(`/notices/${noticeId}`);
}

export async function deleteNotice(noticeId: string) {
  const parsed = z.string().uuid().safeParse(noticeId);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { ok: false };
  if (usesD1AppData()) {
    if (!await isD1Admin(authData.user.id)) return { ok: false };
    const db = await getD1Database();
    const notice = await db.prepare("SELECT title, status FROM notices WHERE id = ?").bind(parsed.data).first<{ title: string; status: string }>();
    if (!notice) return { ok: false };
    await db.batch([
      db.prepare("DELETE FROM notices WHERE id = ?").bind(parsed.data),
      db.prepare("INSERT INTO admin_actions (id, admin_user_id, action_type, target_type, target_id, reason, metadata_json) VALUES (?, ?, 'notice_deleted', 'notice', ?, ?, ?)").bind(crypto.randomUUID(), authData.user.id, parsed.data, `お知らせ「${notice.title}」を削除`, JSON.stringify({ status: notice.status })),
    ]);
    revalidatePath("/admin/notices"); revalidatePath("/notices"); revalidatePath(`/notices/${parsed.data}`);
    return { ok: true };
  }
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false };
  const { data: notice } = await supabase.from("notices").select("title,status").eq("id", parsed.data).maybeSingle();
  if (!notice) return { ok: false };
  const { error } = await supabase.from("notices").delete().eq("id", parsed.data);
  if (error) return { ok: false };
  await supabase.from("admin_actions").insert({ admin_user_id: authData.user.id, action_type: "notice_deleted", target_type: "notice", target_id: parsed.data, reason: `お知らせ「${notice.title}」を削除`, metadata: { status: notice.status } });
  revalidatePath("/admin/notices"); revalidatePath("/notices"); revalidatePath(`/notices/${parsed.data}`);
  return { ok: true };
}

export async function markNoticeRead(noticeId: string) {
  const parsed = z.string().uuid().safeParse(noticeId); if (!parsed.success) return;
  const supabase = await createClient(); const { data } = await supabase.auth.getUser(); if (!data.user) return;
  if (usesD1AppData()) {
    const db = await getD1Database();
    await db.prepare("INSERT INTO notice_reads (notice_id, user_id, read_at) VALUES (?, ?, ?) ON CONFLICT(notice_id, user_id) DO UPDATE SET read_at = excluded.read_at").bind(parsed.data, data.user.id, new Date().toISOString()).run();
    revalidatePath("/notices"); return;
  }
  await supabase.from("notice_reads").upsert({ notice_id: parsed.data, user_id: data.user.id, read_at: new Date().toISOString() });
  revalidatePath("/notices");
}

export async function markPersonalNotificationRead(notificationId: string) {
  const parsed = z.string().uuid().safeParse(notificationId); if (!parsed.success) return;
  const supabase = await createClient(); const { data } = await supabase.auth.getUser(); if (!data.user) return;
  if (usesD1AppData()) {
    const db = await getD1Database();
    await db.prepare("UPDATE user_notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?").bind(new Date().toISOString(), parsed.data, data.user.id).run();
    revalidatePath("/notices"); revalidatePath(`/notifications/${parsed.data}`); return;
  }
  await supabase.rpc("mark_user_notification_read", { notification_id: parsed.data });
  revalidatePath("/notices");
  revalidatePath(`/notifications/${parsed.data}`);
}
