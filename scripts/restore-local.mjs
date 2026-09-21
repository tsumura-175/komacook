import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const backupDirectory = process.argv[2] ? path.resolve(process.argv[2]) : "";
if (!backupDirectory || !process.argv.includes("--confirm-reset")) throw new Error("使用法: npm run restore:local -- <backup-directory> --confirm-reset");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const secret = process.env.SUPABASE_SECRET_KEY ?? "";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) throw new Error("ローカルSupabase以外では restore:local を実行できません。");
if (!secret) throw new Error("SUPABASE_SECRET_KEY が必要です。");

const supabaseCli = path.resolve("node_modules", "supabase", "dist", "supabase.js");
const reset = spawnSync(process.execPath, [supabaseCli, "db", "reset", "--local", "--no-seed", "--yes"], { stdio: "inherit" });
if (reset.status !== 0) throw new Error("DB初期化に失敗しました。");
const sql = await readFile(path.join(backupDirectory, "database.sql"));
const restore = spawnSync("docker", ["exec", "-i", "supabase_db_komacook", "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: sql, stdio: ["pipe", "inherit", "inherit"] });
if (restore.status !== 0) throw new Error("DB復元に失敗しました。");

const manifest = JSON.parse(await readFile(path.join(backupDirectory, "manifest.json"), "utf8"));
const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
for (const object of manifest.objects) {
  const bytes = await readFile(path.join(backupDirectory, "storage", object.bucket, ...object.name.split("/")));
  const { error } = await supabase.storage.from(object.bucket).upload(object.name, bytes, { contentType: object.contentType, upsert: true });
  if (error) throw error;
}
console.log(`復元完了: ${backupDirectory}`);
