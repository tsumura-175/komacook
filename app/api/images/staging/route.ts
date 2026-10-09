import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getD1Database, usesD1AppData } from "../../../../lib/d1-bindings";
import { putR2Image } from "../../../../lib/r2-images";

export const runtime = "edge";

const purposes = new Set(["recipe", "recipe_step", "avatar"]);
const maxUploadBytes = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  const purpose = String(formData.get("purpose") ?? "");
  if (!(file instanceof File) || !purposes.has(purpose) || file.type !== "image/webp" || file.size < 1 || file.size > maxUploadBytes) {
    return NextResponse.json({ error: "画像の形式またはサイズが正しくありません。" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const key = `${data.user.id}/staging/${id}.webp`;
  if (!usesD1AppData()) {
    const { error } = await supabase.storage.from("recipe-images").upload(key, file, { contentType: "image/webp", upsert: false });
    if (error) return NextResponse.json({ error: "画像を一時保存できませんでした。" }, { status: 502 });
    return NextResponse.json({ key });
  }

  try {
    await putR2Image(key, await file.arrayBuffer());
    const db = await getD1Database();
    await db.prepare(`
      INSERT INTO image_uploads (id, owner_user_id, purpose, staging_key, content_type, width, height, expires_at)
      VALUES (?, ?, ?, ?, 'image/webp', 1, 1, datetime('now', '+24 hours'))
    `).bind(id, data.user.id, purpose, key).run();
    return NextResponse.json({ key });
  } catch {
    return NextResponse.json({ error: "画像を一時保存できませんでした。" }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return new NextResponse(null, { status: 401 });
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const expectedPrefix = `${data.user.id}/staging/`;
  if (!key.startsWith(expectedPrefix)) return new NextResponse(null, { status: 404 });

  if (!usesD1AppData()) {
    await supabase.storage.from("recipe-images").remove([key]);
    return new NextResponse(null, { status: 204 });
  }
  const db = await getD1Database();
  const image = await db.prepare("SELECT staging_key FROM image_uploads WHERE staging_key = ? AND owner_user_id = ? AND status = 'staged'").bind(key, data.user.id).first<{ staging_key: string }>();
  if (!image) return new NextResponse(null, { status: 404 });
  const { deleteR2Images } = await import("../../../../lib/r2-images");
  await deleteR2Images([key]);
  await db.prepare("UPDATE image_uploads SET status = 'discarded' WHERE staging_key = ? AND owner_user_id = ?").bind(key, data.user.id).run();
  return new NextResponse(null, { status: 204 });
}
