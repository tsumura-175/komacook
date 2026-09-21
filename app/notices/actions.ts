"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "../../lib/supabase/server";

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
  await supabase.from("notice_reads").upsert({ notice_id: parsed.data, user_id: data.user.id, read_at: new Date().toISOString() });
  revalidatePath("/notices");
}

export async function markPersonalNotificationRead(notificationId: string) {
  const parsed = z.string().uuid().safeParse(notificationId); if (!parsed.success) return;
  const supabase = await createClient(); const { data } = await supabase.auth.getUser(); if (!data.user) return;
  await supabase.rpc("mark_user_notification_read", { notification_id: parsed.data });
  revalidatePath("/notices");
  revalidatePath(`/notifications/${parsed.data}`);
}
