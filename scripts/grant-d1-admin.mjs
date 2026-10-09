import { execFileSync } from "node:child_process";

const userId = process.argv[2] ?? "";
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
  console.error("Usage: npm run d1:grant-admin:remote -- <Supabase Auth user UUID>");
  process.exitCode = 1;
} else {
  const sql = `
    INSERT OR IGNORE INTO profiles (user_id, display_name) VALUES ('${userId}', 'こまクックユーザー');
    INSERT OR IGNORE INTO user_roles (user_id, role) VALUES ('${userId}', 'admin');
  `;
  execFileSync("npx", ["wrangler", "d1", "execute", "komacook-production", "--remote", "--command", sql], { stdio: "inherit", shell: process.platform === "win32" });
}
