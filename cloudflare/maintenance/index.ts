type MaintenanceEnv = {
  DB: D1Database;
  IMAGES: R2Bucket;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  SITE_URL: string;
  CRON_SECRET: string;
};

type OutboxMessage = {
  id: string;
  recipient: string;
  reply_to: string | null;
  subject: string;
  text_body: string;
  attempt_count: number;
};

const MAX_ATTEMPTS = 8;
const OUTBOX_BATCH_SIZE = 25;

function retryAt(attemptCount: number) {
  // 1分、5分、15分、1時間…とし、プロバイダ障害時に過剰送信しない。
  const seconds = Math.min(6 * 60 * 60, [60, 5 * 60, 15 * 60, 60 * 60][Math.min(attemptCount, 3)] * 2 ** Math.max(0, attemptCount - 3));
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function deliverOutbox(env: MaintenanceEnv) {
  const { results } = await env.DB.prepare(
    "SELECT id, recipient, reply_to, subject, text_body, attempt_count FROM mail_outbox WHERE status = 'queued' AND next_attempt_at <= ? ORDER BY created_at LIMIT ?",
  ).bind(new Date().toISOString(), OUTBOX_BATCH_SIZE).all<OutboxMessage>();

  for (const message of results ?? []) {
    const claimed = await env.DB.prepare(
      "UPDATE mail_outbox SET status = 'sending', attempt_count = attempt_count + 1 WHERE id = ? AND status = 'queued'",
    ).bind(message.id).run();
    if (!claimed.meta.changes) continue;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [message.recipient],
          reply_to: message.reply_to ?? undefined,
          subject: message.subject,
          text: message.text_body,
        }),
      });
      const result = await response.json().catch(() => null) as { id?: string; message?: string } | null;
      if (!response.ok || !result?.id) throw new Error(`RESEND_${response.status}:${result?.message?.slice(0, 120) ?? "unknown"}`);
      await env.DB.prepare(
        "UPDATE mail_outbox SET status = 'sent', provider_message_id = ?, sent_at = ?, last_error = NULL WHERE id = ?",
      ).bind(result.id, new Date().toISOString(), message.id).run();
    } catch (error) {
      const attempts = message.attempt_count + 1;
      const lastError = error instanceof Error ? error.message.slice(0, 500) : "MAIL_SEND_FAILED";
      await env.DB.prepare(
        "UPDATE mail_outbox SET status = ?, next_attempt_at = ?, last_error = ? WHERE id = ?",
      ).bind(attempts >= MAX_ATTEMPTS ? "failed" : "queued", retryAt(attempts), lastError, message.id).run();
      console.error("mail delivery failed", { outboxId: message.id, attempts, lastError });
    }
  }
}

async function removeExpiredStagingImages(env: MaintenanceEnv) {
  const { results } = await env.DB.prepare(
    "SELECT id, staging_key FROM image_uploads WHERE status = 'staged' AND expires_at <= ? LIMIT 1000",
  ).bind(new Date().toISOString()).all<{ id: string; staging_key: string }>();
  if (!results?.length) return;
  await env.IMAGES.delete(results.map((image) => image.staging_key));
  await env.DB.batch(results.map((image) => env.DB.prepare("UPDATE image_uploads SET status = 'discarded' WHERE id = ?").bind(image.id)));
}

async function removeExpiredOutbox(env: MaintenanceEnv) {
  await env.DB.prepare(
    "DELETE FROM mail_outbox WHERE status IN ('sent', 'failed') AND expires_at <= ?",
  ).bind(new Date().toISOString()).run();
}

async function runAccountDeletion(env: MaintenanceEnv) {
  const siteUrl = env.SITE_URL.replace(/\/$/, "");
  const response = await fetch(`${siteUrl}/api/internal/account-deletions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
  if (!response.ok) throw new Error(`account deletion maintenance failed: ${response.status}`);
}

export default {
  async scheduled(event, env, ctx) {
    const recurring = [deliverOutbox(env), removeExpiredStagingImages(env), removeExpiredOutbox(env)];
    // 03:10 JST（Cloudflare Cronでは18:10 UTC）のみ、既存の退会削除APIも起動する。
    if (event.cron === "10 18 * * *") recurring.push(runAccountDeletion(env));
    ctx.waitUntil(Promise.all(recurring));
  },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<MaintenanceEnv>;
