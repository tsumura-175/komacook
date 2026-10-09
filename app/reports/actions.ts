"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { queueTransactionalEmail } from "../../lib/email";
import { getSiteUrl } from "../../lib/site-url";
import { createClient } from "../../lib/supabase/server";
import { getD1Database, usesD1AppData } from "../../lib/d1-bindings";

const reportSchema = z.object({
  targetType: z.enum(["recipe", "profile"]),
  targetId: z.string().uuid(),
  reason: z.enum(["copyright", "dangerous", "inappropriate", "spam", "other"]),
  detail: z.string().trim().max(500),
});

export type ReportResult = { ok: boolean; error?: "login_required" | "invalid" | "duplicate" | "not_allowed" | "failed" };

export async function submitReport(input: z.input<typeof reportSchema>): Promise<ReportResult> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { ok: false, error: "login_required" };
  if (parsed.data.targetType === "profile" && parsed.data.targetId === authData.user.id) return { ok: false, error: "not_allowed" };
  if (usesD1AppData()) {
    const db = await getD1Database();
    if (parsed.data.targetType === "recipe") {
      const recipe = await db.prepare("SELECT id FROM recipes WHERE id = ? AND deleted_at IS NULL").bind(parsed.data.targetId).first();
      if (!recipe) return { ok: false, error: "not_allowed" };
    } else {
      const profile = await db.prepare("SELECT user_id FROM profiles WHERE user_id = ?").bind(parsed.data.targetId).first();
      if (!profile) return { ok: false, error: "not_allowed" };
    }
    try {
      await db.prepare("INSERT INTO reports (id, reporter_user_id, target_type, recipe_id, profile_user_id, reason, detail) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), authData.user.id, parsed.data.targetType, parsed.data.targetType === "recipe" ? parsed.data.targetId : null, parsed.data.targetType === "profile" ? parsed.data.targetId : null, parsed.data.reason, parsed.data.detail || null).run();
    } catch (error) { return { ok: false, error: error instanceof Error && error.message.includes("UNIQUE") ? "duplicate" : "failed" }; }
    try {
      const recipient = process.env.REPORT_TO_EMAIL ?? process.env.CONTACT_TO_EMAIL;
      if (!recipient) throw new Error("REPORT_RECIPIENT_NOT_CONFIGURED");
      const targetHref = parsed.data.targetType === "recipe" ? `/recipes/${parsed.data.targetId}` : `/users/${parsed.data.targetId}`;
      await queueTransactionalEmail("report", { to: recipient, subject: `【こまクック】新しい通報（${parsed.data.reason}）`, text: [`対象: ${parsed.data.targetType === "recipe" ? "レシピ" : "プロフィール"}`, `対象URL: ${getSiteUrl()}${targetHref}`, `理由: ${parsed.data.reason}`, parsed.data.detail ? `詳細: ${parsed.data.detail}` : "詳細: （なし）", "", `管理画面: ${getSiteUrl()}/admin/reports`].join("\n") });
    } catch (mailError) { console.error("report notification email failed", { reportTarget: parsed.data.targetId, error: mailError instanceof Error ? mailError.message : "unknown" }); }
    revalidatePath("/admin/reports");
    return { ok: true };
  }

  const target = parsed.data.targetType === "recipe"
    ? { recipe_id: parsed.data.targetId, profile_user_id: null }
    : { recipe_id: null, profile_user_id: parsed.data.targetId };
  const { error } = await supabase.from("reports").insert({
    reporter_user_id: authData.user.id,
    target_type: parsed.data.targetType,
    reason: parsed.data.reason,
    detail: parsed.data.detail || null,
    ...target,
  });

  if (error?.code === "23505") return { ok: false, error: "duplicate" };
  if (error?.code === "42501" || error?.code === "23514") return { ok: false, error: "not_allowed" };
  if (error) return { ok: false, error: "failed" };
  // 通報の記録を優先する。メール事業者が一時的に失敗しても通報自体は失わせない。
  try {
    const recipient = process.env.REPORT_TO_EMAIL ?? process.env.CONTACT_TO_EMAIL;
    if (!recipient) throw new Error("REPORT_RECIPIENT_NOT_CONFIGURED");
    const targetHref = parsed.data.targetType === "recipe" ? `/recipes/${parsed.data.targetId}` : `/users/${parsed.data.targetId}`;
    await queueTransactionalEmail("report", {
      to: recipient,
      subject: `【こまクック】新しい通報（${parsed.data.reason}）`,
      text: [
        `対象: ${parsed.data.targetType === "recipe" ? "レシピ" : "プロフィール"}`,
        `対象URL: ${getSiteUrl()}${targetHref}`,
        `理由: ${parsed.data.reason}`,
        parsed.data.detail ? `詳細: ${parsed.data.detail}` : "詳細: （なし）",
        "",
        `管理画面: ${getSiteUrl()}/admin/reports`,
      ].join("\n"),
    });
  } catch (mailError) {
    console.error("report notification email failed", { reportTarget: parsed.data.targetId, error: mailError instanceof Error ? mailError.message : "unknown" });
  }
  revalidatePath("/admin/reports");
  return { ok: true };
}
