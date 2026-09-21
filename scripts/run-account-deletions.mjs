const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3010";
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET を .env.local に設定してください。");

const response = await fetch(`${siteUrl.replace(/\/$/, "")}/api/internal/account-deletions`, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
});
const result = await response.json();
if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
console.log(JSON.stringify(result, null, 2));
