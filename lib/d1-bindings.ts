import "server-only";
import { getCloudflareBindings } from "./cloudflare-bindings";

/**
 * Supabase Authは継続しつつ、アプリデータだけをD1へ移すための切替スイッチ。
 * 未設定時は既存のSupabase実装を使うため、段階的なデータ移行中に読取元が
 * 意図せず混在しない。
 */
export function usesD1AppData() {
  return process.env.APP_DATA_BACKEND === "d1";
}

export async function getD1Database() {
  const env = await getCloudflareBindings();
  if (!env.DB) throw new Error("D1_DATABASE_NOT_CONFIGURED");
  return env.DB;
}

export async function getImageBucket() {
  const env = await getCloudflareBindings();
  if (!env.IMAGES) throw new Error("R2_IMAGES_NOT_CONFIGURED");
  return env.IMAGES;
}

export function isSafeImageKey(value: string) {
  // R2のキーをURL入力から受け取るため、パス横断・制御文字・任意拡張子を拒否する。
  return /^[0-9a-f-]{36}\/(?:avatar-[0-9a-f-]{36}|[0-9a-f-]{36}(?:\/steps\/[0-9a-f-]{36})?|staging\/[0-9a-f-]{36})\.webp$/i.test(value);
}
