import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const userId = process.argv[2] ?? "";
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
  console.error("Usage: npm run d1:grant-admin:remote -- <Supabase Auth user UUID>");
  process.exitCode = 1;
} else {
  const sql = `
    INSERT OR IGNORE INTO profiles (user_id, display_name, onboarding_completed) VALUES ('${userId}', 'こまクックユーザー', 1);
    INSERT OR IGNORE INTO user_roles (user_id, role) VALUES ('${userId}', 'admin');
    UPDATE profiles SET onboarding_completed = 1 WHERE user_id = '${userId}';
  `;
  // Passing SQL through a Windows shell strips the value following --command.
  // Run Wrangler's JavaScript entrypoint with Node so the SQL stays one argument.
  const wranglerPath = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
  execFileSync(process.execPath, [wranglerPath, "d1", "execute", "komacook-production", "--remote", "--command", sql], { stdio: "inherit" });
}
