import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const secret = process.env.SUPABASE_SECRET_KEY ?? "";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) throw new Error("ローカルSupabase以外では backup:local を実行できません。");
if (!secret) throw new Error("SUPABASE_SECRET_KEY が必要です。");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = path.resolve(process.argv[2] ?? path.join("backups", stamp));
await mkdir(output, { recursive: true });

const supabaseCli = path.resolve("node_modules", "supabase", "dist", "supabase.js");
const dump = spawnSync(process.execPath, [supabaseCli, "db", "dump", "--local", "--data-only", "--use-copy", "--schema", "public,auth", "--exclude", "public.contact_rate_limits", "--file", path.join(output, "database.sql")], { stdio: "inherit" });
if (dump.status !== 0) throw new Error(`DBバックアップに失敗しました。${dump.error ? ` ${dump.error.message}` : ""}`);

const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const buckets = ["avatars", "recipe-images"];
const objects = [];
async function backupPrefix(bucket, prefix = "") {
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    if (!data?.length) break;
    for (const item of data) {
      const objectName = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) {
        const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(objectName);
        if (downloadError) throw downloadError;
        const target = path.join(output, "storage", bucket, ...objectName.split("/"));
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, Buffer.from(await blob.arrayBuffer()));
        objects.push({ bucket, name: objectName, contentType: item.metadata?.mimetype ?? "application/octet-stream" });
      } else await backupPrefix(bucket, objectName);
    }
    if (data.length < 100) break;
    offset += data.length;
  }
}
for (const bucket of buckets) await backupPrefix(bucket);
await writeFile(path.join(output, "manifest.json"), `${JSON.stringify({ createdAt: new Date().toISOString(), objects }, null, 2)}\n`);
console.log(`バックアップ完了: ${output}`);
