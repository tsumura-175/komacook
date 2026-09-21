import "server-only";
import { getCloudflareBindings } from "./cloudflare-bindings";

export type TransactionalEmail = {
  to: string | string[];
  subject: string;
  text: string;
  replyTo?: string;
  from?: string;
};

export type EmailPurpose = "contact" | "report" | "member_notification";

/**
 * Resend の HTTP API を使う。SMTP クライアントは Cloudflare Workers では使えないため、
 * メール送信を Node.js のソケット実装から切り離す。
 */
export async function sendTransactionalEmail(message: TransactionalEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = message.from ?? process.env.EMAIL_FROM;

  // ローカルで画面・フォームを確認する間に外部メールを送らないための明示的な安全弁。
  if (process.env.MAIL_DELIVERY_MODE === "disabled") return { id: "local-delivery-disabled" };
  if (!apiKey || !from) throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      text: message.text,
      reply_to: message.replyTo,
    }),
  });

  const result = await response.json().catch(() => null) as { id?: string; message?: string } | null;
  if (!response.ok || !result?.id) {
    throw new Error(`EMAIL_PROVIDER_FAILED:${response.status}:${result?.message?.slice(0, 80) ?? "unknown"}`);
  }
  return { id: result.id };
}

/**
 * Cloudflare 本番ではD1のoutboxへ積み、Cron Workerが配信と再送を担当する。
 * ローカルでは `MAIL_DELIVERY_MODE=disabled` により外部配信せず、既存の画面テストを行える。
 */
export async function queueTransactionalEmail(purpose: EmailPurpose, message: TransactionalEmail) {
  if (process.env.MAIL_DELIVERY_MODE === "disabled") return { id: "local-delivery-disabled", queued: false };
  if (process.env.EMAIL_DELIVERY_BACKEND !== "d1") {
    const result = await sendTransactionalEmail(message);
    return { ...result, queued: false };
  }

  const env = await getCloudflareBindings();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO mail_outbox (id, purpose, recipient, reply_to, subject, text_body, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, purpose, Array.isArray(message.to) ? message.to.join(",") : message.to, message.replyTo ?? null, message.subject, message.text, expiresAt).run();
  return { id, queued: true };
}
