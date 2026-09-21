"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "../../lib/supabase/server";

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
  revalidatePath("/admin/reports");
  return { ok: true };
}

