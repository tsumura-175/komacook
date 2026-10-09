"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { contactRateLimitIdentifier, contactRequestIdentity } from "../../lib/contact-rate-limit";
import { queueTransactionalEmail } from "../../lib/email";
import { createClient } from "../../lib/supabase/server";
import { getD1Database, usesD1AppData } from "../../lib/d1-bindings";

const schema = z.object({
  name: z.string().trim().min(1).max(50),
  email: z.string().trim().email().max(254),
  type: z.enum(["サービス", "アカウント", "権利", "障害", "その他"]),
  subject: z.string().trim().min(1).max(100).regex(/^[^\r\n]+$/),
  body: z.string().trim().min(1).max(2000),
  website: z.string().max(0),
  startedAt: z.coerce.number().int().positive(),
});

export type ContactState = { sent?: boolean; error?: string };

export async function sendContact(_: ContactState, formData: FormData): Promise<ContactState> {
  const parsed = schema.safeParse({ name: formData.get("name"), email: formData.get("email"), type: formData.get("type"), subject: formData.get("subject"), body: formData.get("body"), website: formData.get("website") ?? "", startedAt: formData.get("started_at") });
  if (!parsed.success) return { error: "入力内容を確認してください。" };
  const elapsed = Date.now() - parsed.data.startedAt;
  if (elapsed < 3_000 || elapsed > 2 * 60 * 60 * 1000) return { error: "送信画面を再読み込みして、もう一度お試しください。" };

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const requestHeaders = await headers();
  const secret = process.env.CONTACT_RATE_LIMIT_SECRET ?? (process.env.NODE_ENV !== "production" ? "komacook-local-contact-limit" : "");
  if (!secret) return { error: "現在お問い合わせを受け付けられません。時間をおいてお試しください。" };
  const identity = contactRequestIdentity(authData.user?.id, requestHeaders.get("x-forwarded-for"), requestHeaders.get("x-real-ip"));
  const identifierHash = contactRateLimitIdentifier(identity, secret);
  if (usesD1AppData()) {
    const db = await getD1Database();
    const now = new Date();
    const windows = [{ bucket: "10m", ms: 10 * 60_000, max: 3 }, { bucket: "24h", ms: 24 * 60 * 60_000, max: 10 }];
    for (const window of windows) {
      const startedAt = new Date(Math.floor(now.getTime() / window.ms) * window.ms).toISOString();
      await db.prepare(`INSERT INTO contact_rate_limits (identifier_hash, bucket, window_started_at, attempt_count) VALUES (?, ?, ?, 1)
        ON CONFLICT(identifier_hash, bucket) DO UPDATE SET attempt_count = CASE WHEN contact_rate_limits.window_started_at = excluded.window_started_at THEN contact_rate_limits.attempt_count + 1 ELSE 1 END, window_started_at = excluded.window_started_at`)
        .bind(identifierHash, window.bucket, startedAt).run();
      const row = await db.prepare("SELECT attempt_count FROM contact_rate_limits WHERE identifier_hash = ? AND bucket = ?").bind(identifierHash, window.bucket).first<{ attempt_count: number }>();
      if (Number(row?.attempt_count ?? 0) > window.max) return { error: `送信回数の上限に達しました。約${Math.max(1, Math.ceil((window.ms - (now.getTime() % window.ms)) / 60_000))}分後にもう一度お試しください。` };
    }
    let succeeded = false;
    let errorCode: string | null = null;
    try {
      const to = process.env.CONTACT_TO_EMAIL;
      if (!to) throw new Error("RECIPIENT_NOT_CONFIGURED");
      await queueTransactionalEmail("contact", { to, replyTo: parsed.data.email, subject: `【こまクック／${parsed.data.type}】${parsed.data.subject}`, text: [`お名前: ${parsed.data.name}`, `返信先: ${parsed.data.email}`, `種別: ${parsed.data.type}`, `件名: ${parsed.data.subject}`, "", parsed.data.body].join("\n") });
      succeeded = true;
    } catch (error) { errorCode = error instanceof Error ? error.message.slice(0, 100) : "MAIL_SEND_FAILED"; }
    await db.prepare("INSERT INTO contact_logs (id, user_id, inquiry_type, delivery_succeeded, error_code) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), authData.user?.id ?? null, parsed.data.type, succeeded ? 1 : 0, errorCode).run();
    return succeeded ? { sent: true } : { error: "送信できませんでした。時間をおいてもう一度お試しください。" };
  }
  const { data: limitRows, error: limitError } = await supabase.rpc("consume_contact_rate_limit", { p_identifier_hash: identifierHash });
  const limit = (limitRows as Array<{ allowed: boolean; retry_after_seconds: number }> | null)?.[0];
  if (limitError || !limit) return { error: "現在お問い合わせを受け付けられません。時間をおいてお試しください。" };
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retry_after_seconds / 60));
    return { error: `送信回数の上限に達しました。約${minutes}分後にもう一度お試しください。` };
  }
  let succeeded = false;
  let errorCode: string | null = null;
  try {
    const to = process.env.CONTACT_TO_EMAIL;
    if (!to) throw new Error("RECIPIENT_NOT_CONFIGURED");
    await queueTransactionalEmail("contact", {
      to, replyTo: parsed.data.email,
      subject: `【こまクック／${parsed.data.type}】${parsed.data.subject}`,
      text: [`お名前: ${parsed.data.name}`, `返信先: ${parsed.data.email}`, `種別: ${parsed.data.type}`, `件名: ${parsed.data.subject}`, "", parsed.data.body].join("\n"),
    });
    succeeded = true;
  } catch (error) {
    errorCode = error instanceof Error ? error.message.slice(0, 100) : "MAIL_SEND_FAILED";
  }
  await supabase.from("contact_logs").insert({ user_id: authData.user?.id ?? null, inquiry_type: parsed.data.type, delivery_succeeded: succeeded, error_code: errorCode });
  return succeeded ? { sent: true } : { error: "送信できませんでした。時間をおいてもう一度お試しください。" };
}
